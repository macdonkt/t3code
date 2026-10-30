// Fork customization (see CUSTOMIZATIONS.md): dev builds read "T3 Dev" in the sidebar header
// so they are never mistaken for the official app.
export function resolveSidebarBrandSuffix(stageLabel: string): string {
  return stageLabel.trim().toLowerCase() === "dev" ? "Dev" : "Code";
}
