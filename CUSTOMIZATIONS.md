# Fork customizations

Changes this fork (macdonkt/t3code) carries on top of upstream pingdotgg/t3code.
Check this list after every upstream merge (`update/vX.Y.Z` branch): each entry should still work.

| Feature                | Branch              | Files                                                                                                                 | Why                                                                                            |
| ---------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| "T3 Dev" sidebar label | `feature/dev-label` | `apps/web/src/components/sidebar/sidebarBrandLabel.ts` (+ test), one call in `SidebarChrome.tsx` (`SidebarBrandMark`) | Dev builds read "T3 Dev" instead of "T3 Code" so they are never mistaken for the official app. |

## Conflict hot spots

- `apps/web/src/components/sidebar/SidebarChrome.tsx` — if upstream reworks `SidebarBrandMark`, re-apply: `resolveSidebarBrandSuffix(useEnvironmentStageLabel())` in place of the literal "Code".
