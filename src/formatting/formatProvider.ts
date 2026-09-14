import * as path from "node:path";
import type * as vscode from "vscode";
import { formatProtoText } from "./bufFormatter.js";
import { diffLines, type LineEdit } from "./textDiff.js";
import { findBufRoot } from "../lsp/rootDiscovery.js";
import { readConfig } from "../config/config.js";
import { getVscode } from "../platform/vscodeRef.js";

export interface FormattingProviderDependencies {
  findRoot?: typeof findBufRoot;
  formatText?: typeof formatProtoText;
  readConfig?: typeof readConfig;
  writeLog?: (level: "info" | "warn" | "error", component: string, message: string, root?: string) => void;
  vscode?: typeof vscode;
}

interface FormattingOutcome {
  readonly formattedText: string;
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
    const outcome = await this.runFormattingPipeline(document);
    if (!outcome || outcome.formattedText === document.getText()) {
      return [];
    }

    const vsc = this.resolveVscode();
    if (!vsc) {
      return [];
    }

    const lastLineIndex = Math.max(0, document.lineCount - 1);
    const lastLine = document.lineAt(lastLineIndex);
    const fullRange = new vsc.Range(new vsc.Position(0, 0), lastLine.range.end);

    return [vsc.TextEdit.replace(fullRange, outcome.formattedText)];
  }

  public async provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    _options: vscode.FormattingOptions,
    token?: vscode.CancellationToken
  ): Promise<vscode.TextEdit[]> {
    const outcome = await this.runFormattingPipeline(document, token);
    if (!outcome || token?.isCancellationRequested) {
      return [];
    }

    const vsc = this.resolveVscode();
    if (!vsc) {
      return [];
    }

    const originalLines = document.getText().split(/\r?\n/);
    const formattedLines = outcome.formattedText.split(/\r?\n/);
    const lineEdits = diffLines(originalLines, formattedLines);
    const selectionStartLine = range.start.line;
    const selectionEndLine = range.end.line;

    const edits: vscode.TextEdit[] = [];
    for (const lineEdit of lineEdits) {
      if (token?.isCancellationRequested) {
        return [];
      }
      if (lineEdit.startLine > selectionEndLine || lineEdit.endLineExclusive <= selectionStartLine) {
        continue;
      }
      edits.push(vsc.TextEdit.replace(this.toWholeLineRange(document, lineEdit, vsc), lineEdit.newText));
    }

    return edits;
  }

  private async runFormattingPipeline(
    document: vscode.TextDocument,
    token?: vscode.CancellationToken
  ): Promise<FormattingOutcome | undefined> {
    if (token?.isCancellationRequested) {
      return undefined;
    }

    if (document.uri.scheme !== "file") {
      return undefined;
    }

    const vsc = this.resolveVscode();
    if (!vsc) {
      return undefined;
    }

    if (!vsc.workspace.isTrusted) {
      return undefined;
    }

    const configReader = this.#deps.readConfig ?? readConfig;
    const config = configReader(document.uri);
    if (!config.formattingEnabled) {
      return undefined;
    }

    const workspaceFolder = vsc.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    const finder = this.#deps.findRoot ?? findBufRoot;
    const bufRoot = await finder(document.uri.fsPath, workspaceFolder);
    if (token?.isCancellationRequested) {
      return undefined;
    }
    const cwd = bufRoot ?? workspaceFolder ?? path.dirname(document.uri.fsPath);

    const formatter = this.#deps.formatText ?? formatProtoText;
    const result = await formatter({
      text: document.getText(),
      bufPath: config.bufPath,
      cwd
    });

    if (token?.isCancellationRequested) {
      return undefined;
    }

    if (!result.success) {
      this.log("warn", `Formatting failed for ${document.uri.fsPath}: ${result.error}`, cwd);
      return undefined;
    }

    return { formattedText: result.formattedText };
  }

  private toWholeLineRange(
    document: vscode.TextDocument,
    lineEdit: LineEdit,
    vsc: typeof vscode
  ): vscode.Range {
    const lineCount = document.lineCount;
    const startIndex = Math.min(Math.max(0, lineEdit.startLine), lineCount - 1);
    const endExclusive = Math.min(Math.max(lineEdit.endLineExclusive, startIndex + 1), lineCount);
    const endIndex = Math.max(startIndex, endExclusive - 1);
    const startLine = document.lineAt(startIndex);
    const endLine = document.lineAt(endIndex);
    return new vsc.Range(startLine.range.start, endLine.range.end);
  }

  private resolveVscode(): typeof vscode | undefined {
    return this.#deps.vscode ?? getVscode();
  }

  private log(level: "info" | "warn" | "error", message: string, root?: string): void {
    if (this.#deps.writeLog) {
      this.#deps.writeLog(level, "Formatter", message, root);
    }
  }
}
