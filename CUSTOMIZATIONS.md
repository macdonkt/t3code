# Fork customizations

Changes this fork (macdonkt/t3code) carries on top of upstream pingdotgg/t3code.
Check this list after every upstream merge (`update/vX.Y.Z` branch): each entry should still work.

| Feature                | Branch                  | Files                                                                                                                          | Why                                                                                                                                                                                                                                                       |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "T3 Dev" sidebar label | `feature/dev-label`     | `apps/web/src/components/sidebar/sidebarBrandLabel.ts` (+ test), one call in `SidebarChrome.tsx` (`SidebarBrandMark`)          | Dev builds read "T3 Dev" instead of "T3 Code" so they are never mistaken for the official app.                                                                                                                                                            |
| ntfy phone alerts      | `feature/ntfy-notifier` | `apps/server/src/relay/NtfyNotifier.ts` (+ test), one `forkParked(runNtfyNotifier(...))` in `AgentAwarenessRelay.ts` `start()` | "Finished / Failed / Needs approval / Needs your input" pushes to an ntfy topic without T3 Connect. Off unless `T3CODE_NTFY_TOPIC` is set (in gitignored `.env.local`); optional `T3CODE_NTFY_SERVER`, `T3CODE_NTFY_TOKEN`, `T3CODE_NTFY_CLICK_BASE_URL`. |

## Conflict hot spots

- `apps/web/src/components/sidebar/SidebarChrome.tsx` — if upstream reworks `SidebarBrandMark`, re-apply: `resolveSidebarBrandSuffix(useEnvironmentStageLabel())` in place of the literal "Code".
- `apps/server/src/relay/AgentAwarenessRelay.ts` — the notifier hook sits in `start()` next to the T3 Connect stream. If upstream moves or renames that start, re-add the `forkParked(runNtfyNotifier({ threads, projects, getEnvironmentId, shouldHandleEvent: shouldPublishAgentAwarenessEvent }))` call wherever the relay still subscribes to `threads.streamDomainEvents`. If upstream changes `projectThreadAwarenessV2` or the phase names, update `NtfyNotifier.ts` and its test.
