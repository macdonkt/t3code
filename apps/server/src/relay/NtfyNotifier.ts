// Fork customization (see CUSTOMIZATIONS.md): push "agent finished / failed / needs you" alerts
// to an ntfy topic, so a private build gets phone notifications without T3 Connect.
// Off unless T3CODE_NTFY_TOPIC is set. Reuses the same thread-awareness projection the T3 Connect
// relay publishes, so the phases match what the official mobile app would alert on.
import type {
  EnvironmentId,
  OrchestrationV2DomainEvent,
  OrchestrationV2ThreadShell,
  ThreadId,
} from "@t3tools/contracts";
import {
  type AgentAwarenessPhase,
  type AgentAwarenessState,
  projectThreadAwarenessV2,
} from "@t3tools/shared/agentAwareness";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import type * as ProjectService from "../project/ProjectService.ts";
import type * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";

export interface NtfyConfig {
  readonly server: string;
  readonly topic: string;
  readonly token: string | null;
  /** Base URL that opens the web UI (e.g. a tailnet address); thread deep links are appended. */
  readonly clickBaseUrl: string | null;
}

export function readNtfyConfig(env: NodeJS.ProcessEnv = process.env): NtfyConfig | null {
  const topic = env.T3CODE_NTFY_TOPIC?.trim();
  if (!topic) return null;
  return {
    server: (env.T3CODE_NTFY_SERVER?.trim() || "https://ntfy.sh").replace(/\/+$/, ""),
    topic,
    token: env.T3CODE_NTFY_TOKEN?.trim() || null,
    clickBaseUrl: env.T3CODE_NTFY_CLICK_BASE_URL?.trim().replace(/\/+$/, "") || null,
  };
}

const ALERT_PHASES: ReadonlySet<AgentAwarenessPhase> = new Set([
  "completed",
  "failed",
  "waiting_for_approval",
  "waiting_for_input",
]);

/**
 * Whether a phase change deserves an alert. Completions and failures only count when the run
 * ended after this server started, so a restart does not replay old results.
 */
export function shouldNotifyPhase(input: {
  readonly previousPhase: AgentAwarenessPhase | null | undefined;
  readonly phase: AgentAwarenessPhase | null;
  readonly terminalSinceStart: boolean;
}): boolean {
  const { previousPhase, phase } = input;
  if (phase === null || !ALERT_PHASES.has(phase) || phase === previousPhase) return false;
  if (phase === "completed" || phase === "failed") return input.terminalSinceStart;
  return true;
}

const PHASE_TITLES: Partial<Record<AgentAwarenessPhase, { title: string; tag: string }>> = {
  completed: { title: "Finished", tag: "white_check_mark" },
  failed: { title: "Failed", tag: "x" },
  waiting_for_approval: { title: "Needs approval", tag: "raised_hand" },
  waiting_for_input: { title: "Needs your input", tag: "speech_balloon" },
};

export function buildNtfyMessage(state: AgentAwarenessState, config: NtfyConfig) {
  const label = PHASE_TITLES[state.phase] ?? { title: state.headline, tag: "robot" };
  return {
    topic: config.topic,
    title: `${label.title} · ${state.threadTitle}`,
    message: `${state.projectTitle} · ${state.modelTitle}`,
    tags: [label.tag],
    priority: state.phase === "completed" ? 3 : 4,
    ...(config.clickBaseUrl === null ? {} : { click: `${config.clickBaseUrl}${state.deepLink}` }),
  };
}

function terminalSinceStart(thread: OrchestrationV2ThreadShell, startedAt: number): boolean {
  return (
    thread.latestRunCompletedAt != null &&
    DateTime.toEpochMillis(thread.latestRunCompletedAt) > startedAt
  );
}

// A run can end moments before its continuation starts; wait before alerting a completion.
const COMPLETION_CONFIRM_MS = 5_000;

export const runNtfyNotifier = Effect.fnUntraced(function* (input: {
  readonly threads: ThreadManagement.ThreadManagementService["Service"];
  readonly projects: ProjectService.ProjectService["Service"];
  readonly getEnvironmentId: Effect.Effect<EnvironmentId>;
  readonly shouldHandleEvent: (event: OrchestrationV2DomainEvent) => boolean;
}) {
  const config = readNtfyConfig();
  if (config === null) {
    yield* Effect.logDebug("ntfy notifier disabled; T3CODE_NTFY_TOPIC not set");
    return;
  }
  yield* Effect.logInfo("ntfy notifier enabled", { server: config.server });

  const startedAt = (yield* DateTime.now).epochMilliseconds;
  const lastPhaseByThread = new Map<ThreadId, AgentAwarenessPhase | null>();
  const pendingCompletions = new Set<ThreadId>();

  const readState = Effect.fnUntraced(function* (threadId: ThreadId) {
    const thread = yield* input.threads.getThreadShell(threadId);
    if (thread === null || thread.archivedAt !== null) return null;
    const project = yield* input.projects.getById(thread.projectId);
    if (Option.isNone(project)) return null;
    const state = projectThreadAwarenessV2({
      environmentId: yield* input.getEnvironmentId,
      project: project.value,
      thread,
    });
    return { state, terminalSinceStart: terminalSinceStart(thread, startedAt) };
  });

  const client = yield* HttpClient.HttpClient;
  const send = (state: AgentAwarenessState) =>
    client
      .execute(
        HttpClientRequest.post(config.server).pipe(
          config.token === null
            ? (request) => request
            : HttpClientRequest.setHeader("Authorization", `Bearer ${config.token}`),
          HttpClientRequest.bodyJsonUnsafe(buildNtfyMessage(state, config)),
        ),
      )
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.timeout("10 seconds"),
        Effect.tap(() => Effect.logInfo("ntfy alert sent", { phase: state.phase })),
        Effect.catchCause((cause) =>
          Effect.logWarning("ntfy alert failed", { cause: Cause.pretty(cause) }),
        ),
      );

  const confirmCompletion = Effect.fnUntraced(function* (threadId: ThreadId) {
    yield* Effect.sleep(COMPLETION_CONFIRM_MS);
    pendingCompletions.delete(threadId);
    const current = yield* readState(threadId);
    if (current?.state?.phase !== "completed" || !current.terminalSinceStart) return;
    yield* send(current.state);
  });

  const handleThread = Effect.fnUntraced(function* (threadId: ThreadId) {
    const current = yield* readState(threadId);
    const state = current?.state ?? null;
    const phase = state?.phase ?? null;
    const previousPhase = lastPhaseByThread.get(threadId);
    lastPhaseByThread.set(threadId, phase);
    if (
      state === null ||
      !shouldNotifyPhase({
        previousPhase,
        phase,
        terminalSinceStart: current?.terminalSinceStart ?? false,
      })
    ) {
      return;
    }
    if (phase === "completed") {
      if (pendingCompletions.has(threadId)) return;
      pendingCompletions.add(threadId);
      yield* Effect.forkDetach(confirmCompletion(threadId));
      return;
    }
    yield* send(state);
  });

  yield* Stream.runForEach(input.threads.streamDomainEvents, (event) =>
    input.shouldHandleEvent(event)
      ? handleThread(event.threadId).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("ntfy notifier failed to read thread", {
              threadId: event.threadId,
              cause: Cause.pretty(cause),
            }),
          ),
        )
      : Effect.void,
  );
}, Effect.provide(FetchHttpClient.layer));
