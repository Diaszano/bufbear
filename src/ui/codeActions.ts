import type * as vscode from "vscode";

function getVscode(): typeof vscode | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("vscode") as typeof vscode;
  } catch {
    return undefined;
  }
}

export interface CodeActionProviderDependencies {
  vscode?: typeof vscode | undefined;
}

export class BufLintCodeActionProvider implements vscode.CodeActionProvider {
  readonly #deps: CodeActionProviderDependencies;

  public constructor(deps: CodeActionProviderDependencies = {}) {
    this.#deps = deps;
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    const vsc = this.#deps.vscode ?? getVscode();
    if (!vsc) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      // Match error messages that end with a suggestion like: such as "foo_bar"
      const match = /name "([^"]+)" should (?:[a-zA-Z0-9_\s,]+ )?such as "([^"]+)"/.exec(diagnostic.message);
      if (!match) {
        continue;
      }

      const incorrectName = match[1];
      const suggestedName = match[2];
      if (!incorrectName || !suggestedName) {
        continue;
      }

      const edit = this.getFixEdit(vsc, document, diagnostic, incorrectName, suggestedName);
      if (!edit) {
        continue;
      }

      const action = new vsc.CodeAction(
        `Rename to "${suggestedName}"`,
        vsc.CodeActionKind.QuickFix
      );
      action.edit = edit;
      action.diagnostics = [diagnostic];
      action.isPreferred = true;

      actions.push(action);
    }

    return actions;
  }

  private getFixEdit(
    vsc: typeof vscode,
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    incorrectName: string,
    suggestedName: string
  ): vscode.WorkspaceEdit | undefined {
    const range = diagnostic.range;
    const rangeText = document.getText(range);

    // Case 1: The range text is exactly the incorrect name
    if (rangeText === incorrectName) {
      const edit = new vsc.WorkspaceEdit();
      edit.replace(document.uri, range, suggestedName);
      return edit;
    }

    // Case 2: The range text contains the incorrect name
    const idx = rangeText.indexOf(incorrectName);
    if (idx !== -1) {
      const startOffset = document.offsetAt(range.start) + idx;
      const endOffset = startOffset + incorrectName.length;
      const exactRange = new vsc.Range(
        document.positionAt(startOffset),
        document.positionAt(endOffset)
      );
      const edit = new vsc.WorkspaceEdit();
      edit.replace(document.uri, exactRange, suggestedName);
      return edit;
    }

    // Case 3: Search the entire line(s) spanned by the range
    const startLine = range.start.line;
    const lineText = document.lineAt(startLine).text;
    const lineIdx = lineText.indexOf(incorrectName);
    if (lineIdx !== -1) {
      const exactRange = new vsc.Range(
        new vsc.Position(startLine, lineIdx),
        new vsc.Position(startLine, lineIdx + incorrectName.length)
      );
      const edit = new vsc.WorkspaceEdit();
      edit.replace(document.uri, exactRange, suggestedName);
      return edit;
    }

    return undefined;
  }
}
