import assert from "node:assert/strict";
import type * as vscode from "vscode";
import type { BufBearConfig } from "../../config/types.js";
import { BufFormattingProvider, type FormattingProviderDependencies } from "../../formatting/formatProvider.js";

class TestPosition {
  public constructor(public line: number, public character: number) {}
}

class TestRange {
  public constructor(public start: TestPosition, public end: TestPosition) {}
}

class TestTextEdit {
  public constructor(public range: TestRange, public newText: string) {}
  public static replace(range: TestRange, newText: string): TestTextEdit {
    return new TestTextEdit(range, newText);
  }
}

const stubVscode = {
  Range: TestRange as unknown as typeof vscode.Range,
  Position: TestPosition as unknown as typeof vscode.Position,
  TextEdit: TestTextEdit as unknown as typeof vscode.TextEdit,
  workspace: {
    isTrusted: true,
    getWorkspaceFolder: () => undefined
  }
} as unknown as typeof vscode;

function createMockConfig(overrides: Partial<BufBearConfig> = {}): BufBearConfig {
  return {
    lspEnabled: true,
    bufPath: "buf",
    traceServer: "off",
    missingBufNotification: true,
    goEnabled: true,
    goGenRoot: "gen/proto-go",
    goSourceRelative: true,
    conflictWarningEnabled: true,
    formattingEnabled: true,
    ...overrides
  };
}

const noopLog = (): void => {
  /* noop */
};

function createDeps(
  formattedText: string,
  overrides: Partial<FormattingProviderDependencies> = {}
): FormattingProviderDependencies {
  return {
    findRoot: () => Promise.resolve("/workspace"),
    formatText: () => Promise.resolve({ success: true, formattedText }),
    readConfig: () => createMockConfig(),
    isTrusted: () => true,
    writeLog: noopLog,
    vscode: stubVscode,
    ...overrides
  };
}

function createMockDocument(text: string): vscode.TextDocument {
  const lines = text.split("\n");
  return {
    uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
    getText: () => text,
    lineCount: lines.length,
    lineAt: (index: number) => {
      const lineText = lines[index] ?? "";
      return {
        range: {
          start: { line: index, character: 0 },
          end: { line: index, character: lineText.length }
        }
      };
    }
  } as unknown as vscode.TextDocument;
}

function createRange(startLine: number, startCharacter: number, endLine: number, endCharacter: number): vscode.Range {
  return new TestRange(new TestPosition(startLine, startCharacter), new TestPosition(endLine, endCharacter)) as unknown as vscode.Range;
}

const noOptions = {} as vscode.FormattingOptions;

function createToken(cancelled = false): vscode.CancellationToken {
  return { isCancellationRequested: cancelled } as unknown as vscode.CancellationToken;
}

describe("BufFormattingProvider", () => {
  it("returns TextEdit replacing full document when format succeeds", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => 'syntax="proto3";',
      lineCount: 1,
      lineAt: () => ({ range: { end: { character: 16 } } })
    } as unknown as vscode.TextDocument;

    const provider = new BufFormattingProvider(createDeps('syntax = "proto3";\n'));
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.ok(edits);
    assert.equal(edits.length, 1);
    assert.equal(edits[0]?.newText, 'syntax = "proto3";\n');
  });

  it("returns one whole-line edit when the selection intersects a single changed line", async () => {
    const original = 'syntax = "proto3";\npackage   foo.v1;\nmessage Foo {\n}\n';
    const formatted = 'syntax = "proto3";\npackage foo.v1;\nmessage Foo {\n}\n';
    const provider = new BufFormattingProvider(createDeps(formatted));

    const edits = await provider.provideDocumentRangeFormattingEdits(
      createMockDocument(original),
      createRange(1, 0, 1, 17),
      noOptions,
      createToken()
    );

    assert.deepEqual(edits, [
      new TestTextEdit(new TestRange(new TestPosition(1, 0), new TestPosition(1, 17)), "package foo.v1;")
    ]);
  });

  it("returns empty edits when changes fall outside the requested range", async () => {
    const original = 'syntax = "proto3";\npackage foo.v1;\nmessage Foo {\n  string  name = 1;\n}\n';
    const formatted = 'syntax = "proto3";\npackage foo.v1;\nmessage Foo {\n  string name = 1;\n}\n';
    const provider = new BufFormattingProvider(createDeps(formatted));

    const edits = await provider.provideDocumentRangeFormattingEdits(
      createMockDocument(original),
      createRange(0, 0, 1, 18),
      noOptions,
      createToken()
    );

    assert.deepEqual(edits, []);
  });

  it("expands multiline reflows crossing the range border to whole-line edits", async () => {
    const original =
      "message Foo {\n  string a = 1;\n  string b = 2;\n}\nmessage Bar {\n  int64  x = 1;\n}\n";
    const formatted =
      "message Foo {\n  string a = 1;  string b = 2;\n}\nmessage Bar {\n  int64 x = 1;\n}\n";
    const provider = new BufFormattingProvider(createDeps(formatted));

    const edits = await provider.provideDocumentRangeFormattingEdits(
      createMockDocument(original),
      createRange(2, 0, 5, 3),
      noOptions,
      createToken()
    );

    assert.equal(edits.length, 2);
    assert.deepEqual(
      edits[0]?.range,
      new TestRange(new TestPosition(1, 0), new TestPosition(2, "  string b = 2;".length))
    );
    assert.equal(edits[0]?.newText, "  string a = 1;  string b = 2;");
    assert.deepEqual(
      edits[1]?.range,
      new TestRange(new TestPosition(5, 0), new TestPosition(5, "  int64  x = 1;".length))
    );
    assert.equal(edits[1]?.newText, "  int64 x = 1;");
  });

  it("returns empty edits when the document is already formatted", async () => {
    const text = 'syntax = "proto3";\npackage foo.v1;\nmessage Foo {\n}\n';
    const provider = new BufFormattingProvider(createDeps(text));

    const edits = await provider.provideDocumentRangeFormattingEdits(
      createMockDocument(text),
      createRange(0, 0, 4, 0),
      noOptions,
      createToken()
    );

    assert.deepEqual(edits, []);
  });

  it("returns empty edits when the cancellation token is already cancelled", async () => {
    const original = 'syntax="proto3";\nmessage Foo{\n}\n';
    const formatted = 'syntax = "proto3";\nmessage Foo {\n}\n';
    const provider = new BufFormattingProvider(createDeps(formatted));

    const edits = await provider.provideDocumentRangeFormattingEdits(
      createMockDocument(original),
      createRange(0, 0, 2, 1),
      noOptions,
      createToken(true)
    );

    assert.deepEqual(edits, []);
  });

  it("returns empty edits silently when formatting is disabled in config", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => 'syntax="proto3";'
    } as unknown as vscode.TextDocument;

    const deps = createDeps('syntax = "proto3";\n', {
      readConfig: () => createMockConfig({ formattingEnabled: false })
    });
    const provider = new BufFormattingProvider(deps);
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.deepEqual(edits, []);
  });

  it("returns empty edits silently when workspace is untrusted", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => 'syntax="proto3";'
    } as unknown as vscode.TextDocument;

    const deps = createDeps('syntax = "proto3";\n', { isTrusted: () => false });
    const provider = new BufFormattingProvider(deps);
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.deepEqual(edits, []);
  });

  it("returns empty edits silently for non-file URI schemes", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "untitled" } as vscode.Uri,
      getText: () => 'syntax="proto3";'
    } as unknown as vscode.TextDocument;

    const provider = new BufFormattingProvider(createDeps('syntax = "proto3";\n'));
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.deepEqual(edits, []);
  });

  it("returns empty edits silently and logs warning when format fails", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => "invalid proto"
    } as unknown as vscode.TextDocument;

    const logs: { level: "info" | "warn" | "error"; component: string; message: string; root?: string | undefined }[] = [];
    const deps = createDeps("", {
      formatText: () => Promise.resolve({ success: false, error: "Syntax error" }),
      writeLog: (level: "info" | "warn" | "error", component: string, message: string, root?: string) => {
        logs.push({ level, component, message, root });
      }
    });

    const provider = new BufFormattingProvider(deps);
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.deepEqual(edits, []);
    assert.equal(logs.length, 1);
    const firstLog = logs[0];
    assert.ok(firstLog);
    assert.equal(firstLog.level, "warn");
    assert.equal(firstLog.component, "Formatter");
    assert.ok(firstLog.message.includes("Formatting failed"));
  });

  it("returns empty edits when formatted text is unchanged", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => 'syntax = "proto3";\n',
      lineCount: 1,
      lineAt: () => ({ range: { end: { character: 18 } } })
    } as unknown as vscode.TextDocument;

    const provider = new BufFormattingProvider(createDeps('syntax = "proto3";\n'));
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.deepEqual(edits, []);
  });
});
