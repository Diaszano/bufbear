import assert from "node:assert/strict";
import type * as vscode from "vscode";
import { BufLintCodeActionProvider } from "../../ui/codeActions.js";

class TestPosition {
  public constructor(public line: number, public character: number) {}
}

class TestRange {
  public constructor(public start: TestPosition, public end: TestPosition) {}
}

class TestWorkspaceEdit {
  public replacements: { uri: vscode.Uri; range: TestRange; newText: string }[] = [];
  public replace(uri: vscode.Uri, range: TestRange, newText: string): void {
    this.replacements.push({ uri, range, newText });
  }
}

class TestCodeAction {
  public edit?: TestWorkspaceEdit;
  public diagnostics?: vscode.Diagnostic[];
  public isPreferred?: boolean;
  public constructor(public title: string, public kind?: vscode.CodeActionKind) {}
}

const mockVscode = {
  Position: TestPosition as unknown as typeof vscode.Position,
  Range: TestRange as unknown as typeof vscode.Range,
  WorkspaceEdit: TestWorkspaceEdit as unknown as typeof vscode.WorkspaceEdit,
  CodeAction: TestCodeAction as unknown as typeof vscode.CodeAction,
  CodeActionKind: {
    QuickFix: "quickfix" as unknown as vscode.CodeActionKind
  }
} as unknown as typeof vscode;

describe("BufLintCodeActionProvider", () => {
  const dummyUri = { fsPath: "/workspace/test.proto" } as vscode.Uri;

  it("returns empty array if vscode API is unavailable", () => {
    const provider = new BufLintCodeActionProvider({ vscode: undefined });
    // When getVscode returns undefined (e.g. running outside VS Code extension host without mock)
    const result = provider.provideCodeActions(
      {} as vscode.TextDocument,
      new TestRange(new TestPosition(0, 0), new TestPosition(0, 0)) as unknown as vscode.Range,
      { diagnostics: [] } as unknown as vscode.CodeActionContext,
      {} as vscode.CancellationToken
    );
    assert.deepEqual(result, []);
  });

  it("ignores diagnostics that do not match the suggestion format", () => {
    const provider = new BufLintCodeActionProvider({ vscode: mockVscode });
    const context: vscode.CodeActionContext = {
      diagnostics: [
        { message: "Syntax error near field", range: new TestRange(new TestPosition(0, 0), new TestPosition(0, 10)) } as unknown as vscode.Diagnostic
      ],
      only: undefined,
      triggerKind: 1
    };
    const actions = (provider.provideCodeActions(
      {} as vscode.TextDocument,
      new TestRange(new TestPosition(0, 0), new TestPosition(0, 10)) as unknown as vscode.Range,
      context,
      {} as vscode.CancellationToken
    ) ?? []) as unknown as TestCodeAction[];

    assert.equal(actions.length, 0);
  });

  it("creates a QuickFix action when range text exactly matches the incorrect name (Case 1)", () => {
    const provider = new BufLintCodeActionProvider({ vscode: mockVscode });

    const diagnostic = {
      message: 'Field name "fooBar" should be lower_snake_case such as "foo_bar"',
      range: new TestRange(new TestPosition(4, 2), new TestPosition(4, 8))
    } as unknown as vscode.Diagnostic;

    const document = {
      uri: dummyUri,
      getText: (range: TestRange) => {
        if (range.start.line === 4 && range.start.character === 2) {
          return "fooBar";
        }
        return "";
      }
    } as unknown as vscode.TextDocument;

    const context: vscode.CodeActionContext = {
      diagnostics: [diagnostic],
      only: undefined,
      triggerKind: 1
    };

    const actions = (provider.provideCodeActions(
      document,
      diagnostic.range,
      context,
      {} as vscode.CancellationToken
    ) ?? []) as unknown as TestCodeAction[];

    assert.equal(actions.length, 1);
    const action = actions[0];
    assert.ok(action);
    assert.equal(action.title, 'Rename to "foo_bar"');
    assert.equal(action.kind, "quickfix" as unknown as vscode.CodeActionKind);
    assert.equal(action.isPreferred, true);
    assert.deepEqual(action.diagnostics, [diagnostic]);

    const edit = action.edit;
    assert.ok(edit);
    assert.equal(edit.replacements.length, 1);
    const replacement = edit.replacements[0];
    assert.ok(replacement);
    assert.equal(replacement.newText, "foo_bar");
    assert.deepEqual(replacement.range, diagnostic.range);
  });

  it("creates a QuickFix action when range text contains the incorrect name (Case 2)", () => {
    const provider = new BufLintCodeActionProvider({ vscode: mockVscode });

    const diagnostic = {
      message: 'Field name "fooBar" should be lower_snake_case such as "foo_bar"',
      range: new TestRange(new TestPosition(4, 0), new TestPosition(4, 20))
    } as unknown as vscode.Diagnostic;

    const document = {
      uri: dummyUri,
      getText: () => "  string fooBar = 1;",
      offsetAt: (pos: TestPosition) => pos.character,
      positionAt: (offset: number) => new TestPosition(4, offset)
    } as unknown as vscode.TextDocument;

    const context: vscode.CodeActionContext = {
      diagnostics: [diagnostic],
      only: undefined,
      triggerKind: 1
    };

    const actions = (provider.provideCodeActions(
      document,
      diagnostic.range,
      context,
      {} as vscode.CancellationToken
    ) ?? []) as unknown as TestCodeAction[];

    assert.equal(actions.length, 1);
    const action = actions[0];
    assert.ok(action);
    assert.equal(action.title, 'Rename to "foo_bar"');

    const edit = action.edit;
    assert.ok(edit);
    assert.equal(edit.replacements.length, 1);
    const replacement = edit.replacements[0];
    assert.ok(replacement);
    assert.equal(replacement.newText, "foo_bar");
    assert.deepEqual(replacement.range.start, new TestPosition(4, 9));
    assert.deepEqual(replacement.range.end, new TestPosition(4, 15));
  });

  it("creates a QuickFix action by searching the line when range text doesn't contain incorrect name (Case 3)", () => {
    const provider = new BufLintCodeActionProvider({ vscode: mockVscode });

    const diagnostic = {
      message: 'Field name "fooBar" should be lower_snake_case such as "foo_bar"',
      range: new TestRange(new TestPosition(4, 0), new TestPosition(4, 5)) // Range on 'string'
    } as unknown as vscode.Diagnostic;

    const document = {
      uri: dummyUri,
      getText: () => "string",
      lineAt: (line: number) => ({ text: `  string fooBar = ${line.toString()};` })
    } as unknown as vscode.TextDocument;

    const context: vscode.CodeActionContext = {
      diagnostics: [diagnostic],
      only: undefined,
      triggerKind: 1
    };

    const actions = (provider.provideCodeActions(
      document,
      diagnostic.range,
      context,
      {} as vscode.CancellationToken
    ) ?? []) as unknown as TestCodeAction[];

    assert.equal(actions.length, 1);
    const action = actions[0];
    assert.ok(action);
    assert.equal(action.title, 'Rename to "foo_bar"');

    const edit = action.edit;
    assert.ok(edit);
    assert.equal(edit.replacements.length, 1);
    const replacement = edit.replacements[0];
    assert.ok(replacement);
    assert.equal(replacement.newText, "foo_bar");
    assert.deepEqual(replacement.range.start, new TestPosition(4, 9));
    assert.deepEqual(replacement.range.end, new TestPosition(4, 15));
  });

  it("returns no action if incorrect name cannot be found in range or line", () => {
    const provider = new BufLintCodeActionProvider({ vscode: mockVscode });

    const diagnostic = {
      message: 'Field name "notFound" should be lower_snake_case such as "not_found"',
      range: new TestRange(new TestPosition(4, 0), new TestPosition(4, 5))
    } as unknown as vscode.Diagnostic;

    const document = {
      uri: dummyUri,
      getText: () => "something else",
      lineAt: () => ({ text: "something else entirely" })
    } as unknown as vscode.TextDocument;

    const context: vscode.CodeActionContext = {
      diagnostics: [diagnostic],
      only: undefined,
      triggerKind: 1
    };

    const actions = (provider.provideCodeActions(
      document,
      diagnostic.range,
      context,
      {} as vscode.CancellationToken
    ) ?? []) as unknown as TestCodeAction[];

    assert.equal(actions.length, 0);
  });

  it("handles multiple diagnostics in context", () => {
    const provider = new BufLintCodeActionProvider({ vscode: mockVscode });

    const diag1 = {
      message: 'Field name "fooBar" should be lower_snake_case such as "foo_bar"',
      range: new TestRange(new TestPosition(1, 0), new TestPosition(1, 6))
    } as unknown as vscode.Diagnostic;

    const diag2 = {
      message: 'Enum zero value name "UNSPECIFIED" should such as "FOO_BAR_UNSPECIFIED"',
      range: new TestRange(new TestPosition(10, 0), new TestPosition(10, 11))
    } as unknown as vscode.Diagnostic;

    const document = {
      uri: dummyUri,
      getText: (range: TestRange) => {
        if (range.start.line === 1) {return "fooBar";}
        if (range.start.line === 10) {return "UNSPECIFIED";}
        return "";
      }
    } as unknown as vscode.TextDocument;

    const context: vscode.CodeActionContext = {
      diagnostics: [diag1, diag2],
      only: undefined,
      triggerKind: 1
    };

    const actions = (provider.provideCodeActions(
      document,
      new TestRange(new TestPosition(0, 0), new TestPosition(20, 0)) as unknown as vscode.Range,
      context,
      {} as vscode.CancellationToken
    ) ?? []) as unknown as TestCodeAction[];

    assert.equal(actions.length, 2);
    const action1 = actions[0];
    const action2 = actions[1];
    assert.ok(action1);
    assert.ok(action2);
    assert.equal(action1.title, 'Rename to "foo_bar"');
    assert.equal(action2.title, 'Rename to "FOO_BAR_UNSPECIFIED"');
  });
});
