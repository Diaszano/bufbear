import * as path from "node:path";
import type * as vscode from "vscode";
import type { ClientManager } from "../lsp/clientManager.js";
import type { ServerState } from "../lsp/serverState.js";
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

const BUF_CONFIG_FILES = new Set([
  "buf.yaml",
  "buf.gen.yaml",
  "buf.work.yaml",
  "buf.lock"
]);

export function isBufOrProtoDocument(document?: vscode.TextDocument): boolean {
  if (!document) {
    return false;
  }
  if (document.languageId === "proto3") {
    return true;
  }
  const fileName = document.fileName;
  if (fileName.endsWith(".proto")) {
    return true;
  }
  const basename = path.basename(fileName);
  return BUF_CONFIG_FILES.has(basename);
}

export interface StatusBarDependencies {
  readonly clientManager: ClientManager;
  readonly createStatusBarItem?: () => vscode.StatusBarItem;
  readonly getActiveTextEditor?: () => vscode.TextEditor | undefined;
  readonly onDidChangeActiveTextEditor?: vscode.Event<vscode.TextEditor | undefined>;
  readonly isTrusted?: () => boolean;
  readonly readConfig?: (resource?: vscode.Uri) => BufBearConfig;
}

export class StatusBar implements vscode.Disposable {
  readonly #deps: StatusBarDependencies;
  readonly #item: vscode.StatusBarItem;
  readonly #disposables: vscode.Disposable[] = [];

  public constructor(dependencies: StatusBarDependencies) {
    this.#deps = dependencies;

    const vsc = getVscode();

    if (dependencies.createStatusBarItem) {
      this.#item = dependencies.createStatusBarItem();
    } else if (vsc) {
      this.#item = vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Right, 100);
    } else {
      throw new Error("createStatusBarItem dependency required outside VS Code environment");
    }

    this.#item.command = "bufBear.showQuickPick";
    this.#item.name = "BufBear Status";

    const onEditorChange =
      dependencies.onDidChangeActiveTextEditor ??
      vsc?.window.onDidChangeActiveTextEditor ??
      (() => ({ dispose: () => { /* no-op */ } }));

    this.#disposables.push(onEditorChange(() => this.update()));
    this.#disposables.push(dependencies.clientManager.onDidChangeStatus(() => this.update()));

    this.update();
  }

  public update(): void {
    const vsc = getVscode();
    const getEditor = this.#deps.getActiveTextEditor ?? (() => vsc?.window.activeTextEditor);
    const editor = getEditor();
    const document = editor?.document;

    if (!isBufOrProtoDocument(document)) {
      this.#item.hide();
      return;
    }

    const isTrustedFn = this.#deps.isTrusted ?? (() => vsc?.workspace.isTrusted ?? true);
    const trusted = isTrustedFn();

    const readCfgFn = this.#deps.readConfig ?? readConfig;
    const config = readCfgFn(document?.uri);

    if (!trusted || !config.lspEnabled) {
      this.render("stopped", "LSP untrusted or disabled");
      this.#item.show();
      return;
    }

    const statuses = this.#deps.clientManager.statuses();
    let state: ServerState = "stopped";
    let detail: string | undefined;

    if (statuses.length > 0) {
      const docPath = document?.uri.fsPath;
      let matched = docPath
        ? statuses.find((s) => docPath === s.root || docPath.startsWith(s.root + path.sep))
        : undefined;

      if (!matched && statuses.length === 1) {
        matched = statuses[0];
      }

      if (matched) {
        state = matched.state;
        detail = matched.detail;
      }
    }

    this.render(state, detail);
    this.#item.show();
  }

  private render(state: ServerState, detail?: string): void {
    let icon: string;
    let label: string;

    switch (state) {
      case "starting":
        icon = "$(sync~spin)";
        label = "Starting";
        break;
      case "ready":
        icon = "$(check)";
        label = "Ready";
        break;
      case "degraded":
        icon = "$(warning)";
        label = "Degraded";
        break;
      case "error":
        icon = "$(error)";
        label = "Error";
        break;
      case "stopped":
      default:
        icon = "$(circle-slash)";
        label = "Disabled / Stopped";
        break;
    }

    this.#item.text = `${icon} BufBear`;
    this.#item.tooltip = detail ? `BufBear: ${label} (${detail})` : `BufBear: ${label}`;
  }

  public dispose(): void {
    this.#item.dispose();
    for (const d of this.#disposables) {
      d.dispose();
    }
  }
}
