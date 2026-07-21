import * as path from "node:path";
import type * as vscode from "vscode";
import { formatProtoText } from "./bufFormatter.js";
import { findBufRoot } from "../lsp/rootDiscovery.js";
import { readConfig } from "../config/config.js";

function getVscode(): typeof vscode | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("vscode") as typeof vscode;
  } catch {
    return undefined;
  }
}

export interface FormattingProviderDependencies {
  findRoot?: typeof findBufRoot;
  formatText?: typeof formatProtoText;
  readConfig?: typeof readConfig;
  isTrusted?: () => boolean;
  getWorkspaceFolder?: (uri: vscode.Uri) => string | undefined;
  writeLog?: (level: "info" | "warn" | "error", component: string, message: string, root?: string) => void;
  vscode?: typeof vscode;
}

export class BufFormattingProvider
  implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider
{
  readonly #deps: FormattingProviderDependencies;

  public constructor(deps: FormattingProviderDependencies = {}) {
    this.#deps = deps;
  }

  public async provideDocumentFormattingEdits(
    document: vscode.TextDocument
  ): Promise<vscode.TextEdit[]> {
    return this.formatDocument(document);
  }

  public provideDocumentRangeFormattingEdits(
    _document: vscode.TextDocument
  ): Promise<vscode.TextEdit[]> {
    return Promise.resolve([]);
  }

  private async formatDocument(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    if (document.uri.scheme !== "file") {
      return [];
    }

    const vsc = this.#deps.vscode ?? getVscode();
    if (!vsc) {
      return [];
    }

    const isTrusted = this.#deps.isTrusted ? this.#deps.isTrusted() : vsc.workspace.isTrusted;
    if (!isTrusted) {
      return [];
    }

    const configReader = this.#deps.readConfig ?? readConfig;
    const config = configReader(document.uri);
    if (!config.formattingEnabled) {
      return [];
    }

    const workspaceFolder = this.getWorkspaceFolder(document.uri);
    const finder = this.#deps.findRoot ?? findBufRoot;
    const bufRoot = await finder(document.uri.fsPath, workspaceFolder);
    const cwd = bufRoot ?? workspaceFolder ?? path.dirname(document.uri.fsPath);

    const text = document.getText();
    const formatter = this.#deps.formatText ?? formatProtoText;
    const result = await formatter({
      text,
      bufPath: config.bufPath,
      cwd
    });

    if (!result.success) {
      this.log("warn", `Formatting failed for ${document.uri.fsPath}: ${result.error}`, cwd);
      return [];
    }

    if (result.formattedText === text) {
      return [];
    }

    const lastLineIndex = Math.max(0, document.lineCount - 1);
    const lastLine = document.lineAt(lastLineIndex);
    const fullRange = new vsc.Range(new vsc.Position(0, 0), lastLine.range.end);

    return [vsc.TextEdit.replace(fullRange, result.formattedText)];
  }

  private getWorkspaceFolder(uri: vscode.Uri): string | undefined {
    if (this.#deps.getWorkspaceFolder) {
      return this.#deps.getWorkspaceFolder(uri);
    }
    const vsc = this.#deps.vscode ?? getVscode();
    return vsc?.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  }

  private log(level: "info" | "warn" | "error", message: string, root?: string): void {
    if (this.#deps.writeLog) {
      this.#deps.writeLog(level, "Formatter", message, root);
    }
  }
}
