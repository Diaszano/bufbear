export const LSP_RESTART_SETTINGS = [
  "bufBear.buf.path",
  "bufBear.lsp.enabled",
  "bufBear.buf.trace.server"
] as const;

export function shouldRestartLsp(affectsConfiguration: (section: string) => boolean): boolean {
  return LSP_RESTART_SETTINGS.some((section) => affectsConfiguration(section));
}
