import type * as vscode from "vscode";
import { readConfig } from "../config/config.js";
import type { BufBearConfig } from "../config/types.js";

function getVscode(): typeof vscode | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("vscode") as typeof vscode;
  } catch {
    return undefined;
  }
}

export const FULL_PROTO_EXTENSIONS = [
  "bufbuild.vscode-buf",
  "zxh404.vscode-proto3",
  "sankethdev.vscode-proto"
] as const;

export interface ConflictDetectorDependencies {
  readonly readConfig?: (resource?: vscode.Uri) => BufBearConfig;
  readonly getExtension?: (id: string) => vscode.Extension<unknown> | undefined;
  readonly showWarningMessage?: (message: string, ...actions: string[]) => Promise<string | undefined>;
  readonly executeCommand?: (command: string, ...rest: unknown[]) => Promise<unknown>;
  readonly updateConfig?: (section: string, value: unknown, target: unknown) => Promise<void>;
}

let hasWarnedThisSession = false;

export function resetConflictWarningSession(): void {
  hasWarnedThisSession = false;
}

export async function checkConflicts(dependencies: ConflictDetectorDependencies = {}): Promise<void> {
  if (hasWarnedThisSession) {
    return;
  }

  const readCfg = dependencies.readConfig ?? readConfig;
  const config = readCfg();

  if (!config.conflictWarningEnabled || !config.lspEnabled) {
    return;
  }

  const vsc = getVscode();
  const getExt = dependencies.getExtension ?? ((id: string) => vsc?.extensions.getExtension(id));
  const activeConflicts: string[] = [];

  for (const extId of FULL_PROTO_EXTENSIONS) {
    const ext = getExt(extId);
    if (ext?.isActive) {
      activeConflicts.push(extId);
    }
  }

  if (activeConflicts.length === 0) {
    return;
  }

  hasWarnedThisSession = true;

  const showWarn =
    dependencies.showWarningMessage ??
    ((msg: string, ...items: string[]) => vsc?.window.showWarningMessage(msg, ...items) ?? Promise.resolve(undefined));
  const execCmd = dependencies.executeCommand ?? ((cmd: string, ...rest: unknown[]) => vsc?.commands.executeCommand(cmd, ...rest) ?? Promise.resolve());

  const message = `BufBear detected another active Protobuf extension (${activeConflicts.join(
    ", "
  )}). Running multiple Protobuf LSP extensions may cause duplicate diagnostics and tooltips.`;

  const action = await showWarn(message, "Open Extensions", "Disable BufBear LSP", "Ignore");

  if (action === "Open Extensions") {
    await execCmd("workbench.extensions.action.showEnabledExtensions");
  } else if (action === "Disable BufBear LSP") {
    if (dependencies.updateConfig) {
      await dependencies.updateConfig("bufBear.lsp.enabled", false, 2 /* Workspace */);
    } else if (vsc) {
      const workspaceConfig = vsc.workspace.getConfiguration("bufBear");
      await workspaceConfig.update("lsp.enabled", false, vsc.ConfigurationTarget.Workspace);
    }
  }
}
