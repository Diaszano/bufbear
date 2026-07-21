import type * as vscode from "vscode";
import type { BufBearConfig, TraceServer } from "./types.js";

function getVscode(): typeof vscode | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("vscode") as typeof vscode;
  } catch {
    return undefined;
  }
}

export function readConfig(resource?: vscode.Uri): BufBearConfig {
  const vsc = getVscode();
  if (!vsc) {
    return {
      lspEnabled: true,
      bufPath: "buf",
      traceServer: "off",
      missingBufNotification: true,
      goEnabled: true,
      goGenRoot: "gen/proto-go",
      goSourceRelative: true,
      conflictWarningEnabled: true,
      formattingEnabled: true
    };
  }
  const config = vsc.workspace.getConfiguration("bufBear", resource);
  return {
    lspEnabled: config.get<boolean>("lsp.enabled", true),
    bufPath: config.get<string>("buf.path", "buf"),
    traceServer: config.get<TraceServer>("buf.trace.server", "off"),
    missingBufNotification: config.get<boolean>("notifications.missingBuf", true),
    goEnabled: config.get<boolean>("go.enabled", true),
    goGenRoot: config.get<string>("go.genRoot", "gen/proto-go"),
    goSourceRelative: config.get<boolean>("go.sourceRelative", true),
    conflictWarningEnabled: config.get<boolean>("conflictWarning.enabled", true),
    formattingEnabled: config.get<boolean>("formatting.enabled", true)
  };
}
