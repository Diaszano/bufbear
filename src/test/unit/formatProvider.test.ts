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

describe("BufFormattingProvider", () => {
  it("returns TextEdit replacing full document when format succeeds", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => 'syntax="proto3";',
      lineCount: 1,
      lineAt: () => ({ range: { end: { character: 16 } } })
    } as unknown as vscode.TextDocument;

    const deps: FormattingProviderDependencies = {
      findRoot: () => Promise.resolve("/workspace"),
      formatText: () => Promise.resolve({ success: true, formattedText: 'syntax = "proto3";\n' }),
      readConfig: () => createMockConfig(),
      isTrusted: () => true,
      writeLog: noopLog,
      vscode: stubVscode
    };

    const provider = new BufFormattingProvider(deps);
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.ok(edits);
    assert.equal(edits.length, 1);
    assert.equal(edits[0]?.newText, 'syntax = "proto3";\n');
  });

  it("returns empty edits on range formatting request", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => 'syntax="proto3";',
      lineCount: 1,
      lineAt: () => ({ range: { end: { character: 16 } } })
    } as unknown as vscode.TextDocument;

    const deps: FormattingProviderDependencies = {
      findRoot: () => Promise.resolve("/workspace"),
      formatText: () => Promise.resolve({ success: true, formattedText: 'syntax = "proto3";\n' }),
      readConfig: () => createMockConfig(),
      isTrusted: () => true,
      writeLog: noopLog,
      vscode: stubVscode
    };

    const provider = new BufFormattingProvider(deps);
    const edits = await provider.provideDocumentRangeFormattingEdits(document);

    assert.ok(edits);
    assert.equal(edits.length, 0);
  });

  it("returns empty edits silently when formatting is disabled in config", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => 'syntax="proto3";'
    } as unknown as vscode.TextDocument;

    const deps: FormattingProviderDependencies = {
      findRoot: () => Promise.resolve("/workspace"),
      formatText: () => Promise.resolve({ success: true, formattedText: 'syntax = "proto3";\n' }),
      readConfig: () => createMockConfig({ formattingEnabled: false }),
      isTrusted: () => true,
      writeLog: noopLog,
      vscode: stubVscode
    };

    const provider = new BufFormattingProvider(deps);
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.deepEqual(edits, []);
  });

  it("returns empty edits silently when workspace is untrusted", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => 'syntax="proto3";'
    } as unknown as vscode.TextDocument;

    const deps: FormattingProviderDependencies = {
      findRoot: () => Promise.resolve("/workspace"),
      formatText: () => Promise.resolve({ success: true, formattedText: 'syntax = "proto3";\n' }),
      readConfig: () => createMockConfig(),
      isTrusted: () => false,
      writeLog: noopLog,
      vscode: stubVscode
    };

    const provider = new BufFormattingProvider(deps);
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.deepEqual(edits, []);
  });

  it("returns empty edits silently for non-file URI schemes", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "untitled" } as vscode.Uri,
      getText: () => 'syntax="proto3";'
    } as unknown as vscode.TextDocument;

    const deps: FormattingProviderDependencies = {
      findRoot: () => Promise.resolve("/workspace"),
      formatText: () => Promise.resolve({ success: true, formattedText: 'syntax = "proto3";\n' }),
      readConfig: () => createMockConfig(),
      isTrusted: () => true,
      writeLog: noopLog,
      vscode: stubVscode
    };

    const provider = new BufFormattingProvider(deps);
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.deepEqual(edits, []);
  });

  it("returns empty edits silently and logs warning when format fails", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => "invalid proto"
    } as unknown as vscode.TextDocument;

    const logs: { level: "info" | "warn" | "error"; component: string; message: string; root?: string | undefined }[] = [];
    const deps: FormattingProviderDependencies = {
      findRoot: () => Promise.resolve("/workspace"),
      formatText: () => Promise.resolve({ success: false, error: "Syntax error" }),
      readConfig: () => createMockConfig(),
      isTrusted: () => true,
      writeLog: (level: "info" | "warn" | "error", component: string, message: string, root?: string) => {
        logs.push({ level, component, message, root });
      },
      vscode: stubVscode
    };

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

    const deps: FormattingProviderDependencies = {
      findRoot: () => Promise.resolve("/workspace"),
      formatText: () => Promise.resolve({ success: true, formattedText: 'syntax = "proto3";\n' }),
      readConfig: () => createMockConfig(),
      isTrusted: () => true,
      writeLog: noopLog,
      vscode: stubVscode
    };

    const provider = new BufFormattingProvider(deps);
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.deepEqual(edits, []);
  });
});
