import assert from "node:assert/strict";
import type * as vscode from "vscode";
import { registerCommands } from "../../ui/commands.js";
import type { ClientManager } from "../../lsp/clientManager.js";
import type { RootServerStatus } from "../../lsp/serverState.js";
import type { BufBearConfig } from "../../config/types.js";
import type { BufProbe } from "../../lsp/bufExecutable.js";

class TestPosition {
  public constructor(public line: number, public character: number) {}
}

class TestRange {
  public constructor(public start: TestPosition, public end: TestPosition) {}
}

class FakeOutput {
  public logs: { level: string; component: string; message: string; root?: string | undefined }[] = [];
  public isShown = false;

  public write(level: "debug" | "info" | "warn" | "error", component: string, message: string, root?: string): void {
    this.logs.push({ level, component, message, root });
  }

  public show(): void {
    this.isShown = true;
  }

  public dispose(): void {
    // Intentionally empty for mock
  }
}

class FakeClientManager {
  public restartedResource: vscode.Uri | undefined;
  public currentStatuses: RootServerStatus[] = [];

  public async ensureForDocument(_document: vscode.TextDocument): Promise<void> {
    await Promise.resolve();
  }

  public async restartForResource(resource?: vscode.Uri, _reason?: string): Promise<void> {
    this.restartedResource = resource;
    await Promise.resolve();
  }

  public async stopForRoot(_root: string): Promise<void> {
    await Promise.resolve();
  }

  public async stopAll(): Promise<void> {
    await Promise.resolve();
  }

  public statuses(): readonly RootServerStatus[] {
    return this.currentStatuses;
  }

  public onDidChangeStatus(
    _listener: (statuses: readonly RootServerStatus[]) => void,
    _thisArgs?: unknown,
    _disposables?: { dispose(): void }[]
  ): vscode.Disposable {
    return {
      dispose: () => undefined
    };
  }
}

function createFakeClientManager(): FakeClientManager & ClientManager {
  return new FakeClientManager() as unknown as FakeClientManager & ClientManager;
}

interface FakeVscodeOptions {
  registered?: Map<string, (...args: unknown[]) => unknown>;
  activeTextEditor?: vscode.TextEditor;
  isTrusted?: boolean;
  showInformationMessage?: (msg: string) => Promise<string | undefined>;
  showWarningMessage?: (msg: string) => Promise<string | undefined>;
  showErrorMessage?: (msg: string) => Promise<string | undefined>;
  showQuickPick?: (items: unknown[]) => Promise<unknown>;
  showTextDocument?: (doc: vscode.TextDocument, options?: unknown) => Promise<vscode.TextEditor>;
  openTextDocument?: (uri: vscode.Uri) => Promise<vscode.TextDocument>;
  executeCommand?: (cmd: string, ...args: unknown[]) => Promise<unknown>;
  customDisposableFrom?: (...items: { dispose: () => unknown }[]) => { dispose: () => unknown };
}

function createFakeVscode(options: FakeVscodeOptions = {}): typeof vscode {
  const registered = options.registered ?? new Map<string, (...args: unknown[]) => unknown>();

  return {
    Range: TestRange as unknown as typeof vscode.Range,
    Position: TestPosition as unknown as typeof vscode.Position,
    Uri: {
      file: (fsPath: string) => ({ fsPath } as vscode.Uri)
    },
    Disposable: {
      from: (...items: { dispose: () => unknown }[]) => {
        if (options.customDisposableFrom) {
          return options.customDisposableFrom(...items);
        }
        return {
          dispose: () => {
            for (const item of items) {
              item.dispose();
            }
          }
        };
      }
    },
    commands: {
      registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
        registered.set(id, handler);
        return {
          dispose: () => {
            registered.delete(id);
          }
        };
      },
      executeCommand: async (cmd: string, ...args: unknown[]) => {
        if (options.executeCommand) {
          return options.executeCommand(cmd, ...args);
        }
        return Promise.resolve();
      }
    },
    window: {
      get activeTextEditor() {
        return options.activeTextEditor;
      },
      showInformationMessage: async (msg: string) => {
        if (options.showInformationMessage) {
          return options.showInformationMessage(msg);
        }
        return Promise.resolve(undefined);
      },
      showWarningMessage: async (msg: string) => {
        if (options.showWarningMessage) {
          return options.showWarningMessage(msg);
        }
        return Promise.resolve(undefined);
      },
      showErrorMessage: async (msg: string) => {
        if (options.showErrorMessage) {
          return options.showErrorMessage(msg);
        }
        return Promise.resolve(undefined);
      },
      showQuickPick: async (items: unknown[]) => {
        if (options.showQuickPick) {
          return options.showQuickPick(items);
        }
        return Promise.resolve(undefined);
      },
      showTextDocument: async (doc: vscode.TextDocument, docOptions?: unknown) => {
        if (options.showTextDocument) {
          return options.showTextDocument(doc, docOptions);
        }
        return Promise.resolve({} as vscode.TextEditor);
      }
    },
    workspace: {
      isTrusted: options.isTrusted ?? true,
      getWorkspaceFolder: () => undefined,
      asRelativePath: (resource: vscode.Uri | string) =>
        typeof resource === "string" ? resource : resource.fsPath,
      openTextDocument: async (uri: vscode.Uri) => {
        if (options.openTextDocument) {
          return options.openTextDocument(uri);
        }
        return Promise.resolve({ uri } as vscode.TextDocument);
      }
    }
  } as unknown as typeof vscode;
}

describe("Commands", () => {
  it("registers all required commands and disposes cleanly", () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    const fakeManager = createFakeClientManager();
    const fakeOutput = new FakeOutput();
    const vsc = createFakeVscode({ registered });

    const disposable = registerCommands({
      clientManager: fakeManager,
      output: fakeOutput,
      vscode: vsc
    });

    assert.ok(registered.has("bufBear.restartServer"));
    assert.ok(registered.has("bufBear.showOutput"));
    assert.ok(registered.has("bufBear.checkHealth"));
    assert.ok(registered.has("bufBear.openSettings"));
    assert.ok(registered.has("bufBear.goToGeneratedImplementation"));
    assert.ok(registered.has("bufBear.formatDocument"));
    assert.ok(registered.has("bufBear.showQuickPick"));

    disposable.dispose();
    assert.strictEqual(registered.size, 0);
  });

  it("uses vscode.Disposable.from when available", () => {
    let fromCalledWithCount = 0;
    let disposedCount = 0;
    const fakeManager = createFakeClientManager();
    const fakeOutput = new FakeOutput();

    const vsc = createFakeVscode({
      customDisposableFrom: (...items) => {
        fromCalledWithCount = items.length;
        return {
          dispose: () => {
            for (const item of items) {
              item.dispose();
              disposedCount++;
            }
          }
        };
      }
    });

    const disposable = registerCommands({
      clientManager: fakeManager,
      output: fakeOutput,
      vscode: vsc
    });

    assert.ok(fromCalledWithCount > 0, "Disposable.from should have been invoked");
    disposable.dispose();
    assert.strictEqual(disposedCount, fromCalledWithCount, "All registered command disposables should be disposed");
  });

  it("restartServer command delegates to clientManager.restartForResource", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    const fakeManager = createFakeClientManager();
    const fakeOutput = new FakeOutput();
    const vsc = createFakeVscode({ registered });

    const disposable = registerCommands({
      clientManager: fakeManager,
      output: fakeOutput,
      vscode: vsc
    });

    const handler = registered.get("bufBear.restartServer");
    assert.ok(handler);

    const testUri = { fsPath: "/workspace/service.proto" } as vscode.Uri;
    await handler(testUri);

    assert.strictEqual(fakeManager.restartedResource, testUri);
    disposable.dispose();
  });

  it("showOutput command shows the output channel", () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    const fakeManager = createFakeClientManager();
    const fakeOutput = new FakeOutput();
    const vsc = createFakeVscode({ registered });

    const disposable = registerCommands({
      clientManager: fakeManager,
      output: fakeOutput,
      vscode: vsc
    });

    const handler = registered.get("bufBear.showOutput");
    assert.ok(handler);

    handler();
    assert.strictEqual(fakeOutput.isShown, true);
    disposable.dispose();
  });

  it("checkHealth command outputs formatted health report without env vars", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    const fakeManager = createFakeClientManager();
    const fakeOutput = new FakeOutput();

    fakeManager.currentStatuses = [{ root: "/workspace", state: "ready" }];

    const fakeProbeBuf = async (): Promise<BufProbe> => {
      return Promise.resolve({
        executable: "buf",
        version: "1.30.0",
        supportsLsp: true
      });
    };

    const fakeReadConfig = (): BufBearConfig => ({
      lspEnabled: true,
      bufPath: "buf",
      traceServer: "off",
      missingBufNotification: true,
      goEnabled: true,
      goGenRoot: "gen/proto-go",
      goSourceRelative: true,
      conflictWarningEnabled: true,
      formattingEnabled: true
    });

    const vsc = createFakeVscode({
      registered,
      activeTextEditor: {
        document: {
          uri: { fsPath: "/workspace/proto/foo.proto" }
        }
      } as unknown as vscode.TextEditor
    });

    const disposable = registerCommands({
      clientManager: fakeManager,
      output: fakeOutput,
      vscode: vsc,
      probeBuf: fakeProbeBuf,
      readConfig: fakeReadConfig,
      findRoot: async () => Promise.resolve("/workspace")
    });

    const handler = registered.get("bufBear.checkHealth");
    assert.ok(handler);

    await handler();

    assert.strictEqual(fakeOutput.isShown, true);
    const healthLog = fakeOutput.logs.find((l) => l.component === "Health");
    assert.ok(healthLog);
    assert.ok(healthLog.message.includes("BufBear health"));
    assert.ok(healthLog.message.includes("- Workspace trusted: yes"));
    assert.ok(healthLog.message.includes("- Buf executable: buf"));
    assert.ok(healthLog.message.includes("- Buf version: 1.30.0"));
    assert.ok(healthLog.message.includes("- LSP support: yes"));
    assert.ok(healthLog.message.includes("- Client state: ready"));

    disposable.dispose();
  });

  it("openSettings executes workbench.action.openSettings", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    let executedCommand: string | undefined;
    let executedArgs: unknown[] = [];
    const vsc = createFakeVscode({
      registered,
      executeCommand: (cmd: string, ...args: unknown[]) => {
        executedCommand = cmd;
        executedArgs = args;
        return Promise.resolve();
      }
    });

    const disposable = registerCommands({
      clientManager: createFakeClientManager(),
      output: new FakeOutput(),
      vscode: vsc
    });

    const handler = registered.get("bufBear.openSettings");
    assert.ok(handler);
    await handler();

    assert.strictEqual(executedCommand, "workbench.action.openSettings");
    assert.deepStrictEqual(executedArgs, ["@ext:diaszano.bufbear"]);
    disposable.dispose();
  });

  it("goToGeneratedImplementation shows message when active editor is not a proto file", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    let shownMessage: string | undefined;

    const vsc = createFakeVscode({
      registered,
      activeTextEditor: {
        document: { fileName: "/workspace/main.go" }
      } as unknown as vscode.TextEditor,
      showInformationMessage: async (msg) => {
        shownMessage = msg;
        return Promise.resolve(undefined);
      }
    });

    const disposable = registerCommands({
      clientManager: createFakeClientManager(),
      output: new FakeOutput(),
      vscode: vsc
    });

    const handler = registered.get("bufBear.goToGeneratedImplementation");
    assert.ok(handler);
    await handler();

    assert.strictEqual(shownMessage, "Place the cursor on a message, enum, service, or rpc declaration.");
    disposable.dispose();
  });

  it("goToGeneratedImplementation shows no buf root message when resolution returns no_buf_root", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    let shownMessage: string | undefined;

    const vsc = createFakeVscode({
      registered,
      activeTextEditor: {
        document: { fileName: "/workspace/user.proto" },
        selection: { active: { line: 0, character: 5 } }
      } as unknown as vscode.TextEditor,
      showInformationMessage: async (msg) => {
        shownMessage = msg;
        return Promise.resolve(undefined);
      }
    });

    const disposable = registerCommands({
      clientManager: createFakeClientManager(),
      output: new FakeOutput(),
      vscode: vsc,
      resolveGoImplementation: async () => Promise.resolve({ status: "no_buf_root" as const })
    });

    const handler = registered.get("bufBear.goToGeneratedImplementation");
    assert.ok(handler);
    await handler();

    assert.strictEqual(shownMessage, "No Buf module root was found.");
    disposable.dispose();
  });

  it("goToGeneratedImplementation opens target document when resolution succeeds", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    let openedUri: vscode.Uri | undefined;
    let shownDoc: vscode.TextDocument | undefined;

    const vsc = createFakeVscode({
      registered,
      activeTextEditor: {
        document: { fileName: "/workspace/user.proto" },
        selection: { active: { line: 0, character: 5 } }
      } as unknown as vscode.TextEditor,
      openTextDocument: async (uri) => {
        openedUri = uri;
        return Promise.resolve({ uri } as vscode.TextDocument);
      },
      showTextDocument: async (doc) => {
        shownDoc = doc;
        return Promise.resolve({} as vscode.TextEditor);
      }
    });

    const disposable = registerCommands({
      clientManager: createFakeClientManager(),
      output: new FakeOutput(),
      vscode: vsc,
      resolveGoImplementation: async () =>
        Promise.resolve({
          status: "success" as const,
          result: {
            filePath: "/workspace/gen/proto-go/user.pb.go",
            location: { line: 10, startCharacter: 2, endCharacter: 10 }
          }
        })
    });

    const handler = registered.get("bufBear.goToGeneratedImplementation");
    assert.ok(handler);
    await handler();

    assert.ok(openedUri);
    assert.strictEqual(openedUri.fsPath, "/workspace/gen/proto-go/user.pb.go");
    assert.ok(shownDoc);
    disposable.dispose();
  });

  it("showQuickPick executes the selected command", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    let executedCommand: string | undefined;

    const vsc = createFakeVscode({
      registered,
      showQuickPick: (items) => Promise.resolve((items as { command: string }[])[0]),
      executeCommand: (cmd: string) => {
        executedCommand = cmd;
        return Promise.resolve();
      }
    });

    const disposable = registerCommands({
      clientManager: createFakeClientManager(),
      output: new FakeOutput(),
      vscode: vsc
    });

    const handler = registered.get("bufBear.showQuickPick");
    assert.ok(handler);
    await handler();

    assert.strictEqual(executedCommand, "bufBear.checkHealth");
    disposable.dispose();
  });

  it("formatDocument shows warning when active editor is not proto3", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    let warnMsg: string | undefined;

    const vsc = createFakeVscode({
      registered,
      activeTextEditor: {
        document: { languageId: "typescript", uri: { fsPath: "/workspace/app.ts" } }
      } as unknown as vscode.TextEditor,
      showWarningMessage: async (msg) => {
        warnMsg = msg;
        return Promise.resolve(undefined);
      }
    });

    const disposable = registerCommands({
      clientManager: createFakeClientManager(),
      output: new FakeOutput(),
      vscode: vsc
    });

    const handler = registered.get("bufBear.formatDocument");
    assert.ok(handler);
    await handler();

    assert.strictEqual(warnMsg, "Active editor is not a Protobuf file.");
    disposable.dispose();
  });

  it("formatDocument shows warning message when formatProtoText fails", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    let warnMsg: string | undefined;

    const vsc = createFakeVscode({
      registered,
      activeTextEditor: {
        document: {
          languageId: "proto3",
          uri: { fsPath: "/workspace/api.proto" },
          getText: () => 'syntax = "proto3";'
        }
      } as unknown as vscode.TextEditor,
      showWarningMessage: async (msg) => {
        warnMsg = msg;
        return Promise.resolve(undefined);
      }
    });

    const disposable = registerCommands({
      clientManager: createFakeClientManager(),
      output: new FakeOutput(),
      vscode: vsc,
      readConfig: () => ({
        lspEnabled: true,
        bufPath: "buf",
        traceServer: "off",
        missingBufNotification: true,
        goEnabled: true,
        goGenRoot: "gen/proto-go",
        goSourceRelative: true,
        conflictWarningEnabled: true,
        formattingEnabled: true
      }),
      formatProtoText: async () => Promise.resolve({ success: false as const, error: "syntax error on line 1" })
    });

    const handler = registered.get("bufBear.formatDocument");
    assert.ok(handler);
    await handler();

    assert.strictEqual(warnMsg, "BufBear Formatting Error: syntax error on line 1");
    disposable.dispose();
  });

  it("formatDocument skips formatting and shows info when the workspace is not trusted", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    let infoMsg: string | undefined;
    let formatCalled = false;

    const vsc = createFakeVscode({
      registered,
      isTrusted: false,
      activeTextEditor: {
        document: {
          languageId: "proto3",
          uri: { fsPath: "/workspace/api.proto" },
          getText: () => 'syntax = "proto3";'
        }
      } as unknown as vscode.TextEditor,
      showInformationMessage: async (msg) => {
        infoMsg = msg;
        return Promise.resolve(undefined);
      }
    });

    const disposable = registerCommands({
      clientManager: createFakeClientManager(),
      output: new FakeOutput(),
      vscode: vsc,
      formatProtoText: async () => {
        formatCalled = true;
        return Promise.resolve({ success: true as const, formattedText: 'syntax = "proto3";\n' });
      }
    });

    const handler = registered.get("bufBear.formatDocument");
    assert.ok(handler);
    await handler();

    assert.strictEqual(formatCalled, false);
    assert.match(infoMsg ?? "", /untrusted/i);
    disposable.dispose();
  });

  it("formatDocument skips formatting and shows info when formatting.enabled is false", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    let infoMsg: string | undefined;
    let formatCalled = false;

    const vsc = createFakeVscode({
      registered,
      activeTextEditor: {
        document: {
          languageId: "proto3",
          uri: { fsPath: "/workspace/api.proto" },
          getText: () => 'syntax = "proto3";'
        }
      } as unknown as vscode.TextEditor,
      showInformationMessage: async (msg) => {
        infoMsg = msg;
        return Promise.resolve(undefined);
      }
    });

    const disposable = registerCommands({
      clientManager: createFakeClientManager(),
      output: new FakeOutput(),
      vscode: vsc,
      readConfig: () => ({
        lspEnabled: true,
        bufPath: "buf",
        traceServer: "off",
        missingBufNotification: true,
        goEnabled: true,
        goGenRoot: "gen/proto-go",
        goSourceRelative: true,
        conflictWarningEnabled: true,
        formattingEnabled: false
      }),
      formatProtoText: async () => {
        formatCalled = true;
        return Promise.resolve({ success: true as const, formattedText: 'syntax = "proto3";\n' });
      }
    });

    const handler = registered.get("bufBear.formatDocument");
    assert.ok(handler);
    await handler();

    assert.strictEqual(formatCalled, false);
    assert.match(infoMsg ?? "", /bufBear\.formatting\.enabled/);
    assert.match(infoMsg ?? "", /disabled/i);
    disposable.dispose();
  });

  it("formatDocument executes editor.edit when formatProtoText returns formatted text", async () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>();
    let editCalled = false;
    let editContent = "";

    const vsc = createFakeVscode({
      registered,
      activeTextEditor: {
        document: {
          languageId: "proto3",
          uri: { fsPath: "/workspace/api.proto" },
          getText: () => 'syntax="proto3";',
          lineCount: 1,
          lineAt: () => ({ range: { end: { line: 0, character: 16 } } })
        },
        edit: async (callback: (builder: { replace: (range: unknown, text: string) => void }) => void) => {
          editCalled = true;
          callback({
            replace: (_range: unknown, text: string) => {
              editContent = text;
            }
          });
          return Promise.resolve(true);
        }
      } as unknown as vscode.TextEditor
    });

    const disposable = registerCommands({
      clientManager: createFakeClientManager(),
      output: new FakeOutput(),
      vscode: vsc,
      readConfig: () => ({
        lspEnabled: true,
        bufPath: "buf",
        traceServer: "off",
        missingBufNotification: true,
        goEnabled: true,
        goGenRoot: "gen/proto-go",
        goSourceRelative: true,
        conflictWarningEnabled: true,
        formattingEnabled: true
      }),
      formatProtoText: async () => Promise.resolve({ success: true as const, formattedText: 'syntax = "proto3";\n' })
    });

    const handler = registered.get("bufBear.formatDocument");
    assert.ok(handler);
    await handler();

    assert.strictEqual(editCalled, true);
    assert.strictEqual(editContent, 'syntax = "proto3";\n');
    disposable.dispose();
  });
});
