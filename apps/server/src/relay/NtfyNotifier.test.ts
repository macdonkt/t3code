import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { AgentAwarenessState } from "@t3tools/shared/agentAwareness";
import { describe, expect, it } from "vite-plus/test";

import { buildNtfyMessage, readNtfyConfig, shouldNotifyPhase } from "./NtfyNotifier.ts";

const state = (phase: AgentAwarenessState["phase"]): AgentAwarenessState => ({
  environmentId: "env-1" as EnvironmentId,
  threadId: "thread-1" as ThreadId,
  projectTitle: "server",
  threadTitle: "Fix the build",
  phase,
  headline: "Task complete",
  modelTitle: "claude-opus",
  updatedAt: "2026-10-30T00:00:00.000Z",
  deepLink: "/threads/env-1/thread-1",
});

describe("readNtfyConfig", () => {
  it("is off without a topic", () => {
    expect(readNtfyConfig({})).toBeNull();
    expect(readNtfyConfig({ T3CODE_NTFY_TOPIC: "  " })).toBeNull();
  });

  it("defaults to ntfy.sh and trims trailing slashes", () => {
    expect(
      readNtfyConfig({
        T3CODE_NTFY_TOPIC: "kevin-t3",
        T3CODE_NTFY_CLICK_BASE_URL: "http://laptop.tail:5733/",
      }),
    ).toEqual({
      server: "https://ntfy.sh",
      topic: "kevin-t3",
      token: null,
      clickBaseUrl: "http://laptop.tail:5733",
    });
  });
});

describe("shouldNotifyPhase", () => {
  it("alerts on entering an alert phase once", () => {
    expect(
      shouldNotifyPhase({ previousPhase: "running", phase: "completed", terminalSinceStart: true }),
    ).toBe(true);
    expect(
      shouldNotifyPhase({
        previousPhase: "completed",
        phase: "completed",
        terminalSinceStart: true,
      }),
    ).toBe(false);
    expect(
      shouldNotifyPhase({
        previousPhase: "running",
        phase: "waiting_for_approval",
        terminalSinceStart: false,
      }),
    ).toBe(true);
  });

  it("ignores runs that ended before the server started", () => {
    expect(
      shouldNotifyPhase({
        previousPhase: undefined,
        phase: "completed",
        terminalSinceStart: false,
      }),
    ).toBe(false);
    expect(
      shouldNotifyPhase({ previousPhase: undefined, phase: "failed", terminalSinceStart: false }),
    ).toBe(false);
  });

  it("never alerts on running or cleared threads", () => {
    expect(
      shouldNotifyPhase({ previousPhase: "starting", phase: "running", terminalSinceStart: true }),
    ).toBe(false);
    expect(
      shouldNotifyPhase({ previousPhase: "completed", phase: null, terminalSinceStart: true }),
    ).toBe(false);
  });
});

describe("buildNtfyMessage", () => {
  const config = { server: "https://ntfy.sh", topic: "kevin-t3", token: null, clickBaseUrl: null };

  it("names the thread and project", () => {
    expect(buildNtfyMessage(state("completed"), config)).toEqual({
      topic: "kevin-t3",
      title: "Finished · Fix the build",
      message: "server · claude-opus",
      tags: ["white_check_mark"],
      priority: 3,
    });
  });

  it("adds a click link when a base URL is set", () => {
    expect(
      buildNtfyMessage(state("waiting_for_approval"), {
        ...config,
        clickBaseUrl: "http://laptop.tail:5733",
      }),
    ).toMatchObject({
      title: "Needs approval · Fix the build",
      priority: 4,
      click: "http://laptop.tail:5733/threads/env-1/thread-1",
    });
  });
});
