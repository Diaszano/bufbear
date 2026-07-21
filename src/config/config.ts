import * as vscode from "vscode";
import type { BufBearConfig, TraceServer } from "./types.js";

export function readConfig(resource?: vscode.Uri): BufBearConfig {
  const config = vscode.workspace.getConfiguration("bufBear", resource);
  return {
    lspEnabled: config.get<boolean>("lsp.enabled", true),
    bufPath: config.get<string>("buf.path", "buf"),
    traceServer: config.get<TraceServer>("buf.trace.server", "off"),
    missingBufNotification: config.get<boolean>("notifications.missingBuf", true),
    goEnabled: config.get<boolean>("go.enabled", true),
    goGenRoot: config.get<string>("go.genRoot", "gen/proto-go"),
    goSourceRelative: config.get<boolean>("go.sourceRelative", true),
    conflictWarningEnabled: config.get<boolean>("conflictWarning.enabled", true)
  };
}
