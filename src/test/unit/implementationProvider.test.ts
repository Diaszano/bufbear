import assert from "node:assert/strict";
import type * as vscode from "vscode";
import {
  GeneratedGoImplementationProvider,
  resolveGoImplementation
} from "../../navigation/go/implementationProvider.js";
import { GoNavigationService } from "../../navigation/go/navigationService.js";
import type { BufBearConfig } from "../../config/types.js";
import type { ProtoDeclaration } from "../../navigation/go/declaration.js";

class FakeOutput {
  public logs: { level: string; component: string; message: string; root?: string | undefined }[] = [];

  public write(level: "debug" | "info" | "warn" | "error", component: string, message: string, root?: string): void {
    if (root !== undefined) {
      this.logs.push({ level, component, message, root });
    } else {
      this.logs.push({ level, component, message });
    }
  }
}

function makeDoc(content: string, fsPath = "/workspace/proto/user.proto"): vscode.TextDocument {
  return {
    getText: () => content,
    uri: { fsPath } as vscode.Uri,
    fileName: fsPath,
    languageId: "proto3"
  } as unknown as vscode.TextDocument;
}

function makeToken(cancelled = false): vscode.CancellationToken {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: () => ({
      dispose: () => {
        // Mock dispose
      }
    })
  };
}

describe("GeneratedGoImplementationProvider", () => {
  it("returns undefined when workspace is untrusted", async () => {
    const fakeOutput = new FakeOutput();
    const navigation = new GoNavigationService();
    const provider = new GeneratedGoImplementationProvider({
      navigation,
      output: fakeOutput,
      isTrusted: () => false
    });

    const doc = makeDoc("message UserResponse {}");
    const pos = { line: 0, character: 9 } as vscode.Position;
    const result = await provider.provideImplementation(doc, pos, makeToken());

    assert.strictEqual(result, undefined);
  });

  it("returns undefined when cancellation is requested early", async () => {
    const fakeOutput = new FakeOutput();
    const navigation = new GoNavigationService();
    const provider = new GeneratedGoImplementationProvider({
      navigation,
      output: fakeOutput,
      isTrusted: () => true
    });

    const doc = makeDoc("message UserResponse {}");
    const pos = { line: 0, character: 9 } as vscode.Position;
    const result = await provider.provideImplementation(doc, pos, makeToken(true));

    assert.strictEqual(result, undefined);
  });

  it("returns undefined when go.enabled or go.sourceRelative is false", async () => {
    const fakeOutput = new FakeOutput();
    const navigation = new GoNavigationService();
    const providerDisabled = new GeneratedGoImplementationProvider({
      navigation,
      output: fakeOutput,
      isTrusted: () => true,
      readConfig: (): BufBearConfig => ({
        lspEnabled: true,
        bufPath: "buf",
        traceServer: "off",
        missingBufNotification: true,
        goEnabled: false,
        goGenRoot: "gen/proto-go",
        goSourceRelative: true,
        conflictWarningEnabled: true
      })
    });

    const doc = makeDoc("message UserResponse {}");
    const pos = { line: 0, character: 9 } as vscode.Position;
    const res1 = await providerDisabled.provideImplementation(doc, pos, makeToken());
    assert.strictEqual(res1, undefined);
  });

  it("returns undefined when cursor is not on a valid declaration", async () => {
    const fakeOutput = new FakeOutput();
    const navigation = new GoNavigationService();
    const provider = new GeneratedGoImplementationProvider({
      navigation,
      output: fakeOutput,
      isTrusted: () => true,
      findDeclarationAt: () => undefined
    });

    const doc = makeDoc("syntax = \"proto3\";");
    const pos = { line: 0, character: 2 } as vscode.Position;
    const result = await provider.provideImplementation(doc, pos, makeToken());

    assert.strictEqual(result, undefined);
  });

  it("returns undefined when file has no workspace folder", async () => {
    const fakeOutput = new FakeOutput();
    const navigation = new GoNavigationService();
    const provider = new GeneratedGoImplementationProvider({
      navigation,
      output: fakeOutput,
      isTrusted: () => true,
      findDeclarationAt: () => ({ kind: "message", name: "UserResponse", line: 0, startCharacter: 8, endCharacter: 20 }),
      getWorkspaceFolder: () => undefined
    });

    const doc = makeDoc("message UserResponse {}");
    const pos = { line: 0, character: 9 } as vscode.Position;
    const result = await provider.provideImplementation(doc, pos, makeToken());

    assert.strictEqual(result, undefined);
  });

  it("returns undefined when no Buf root is found", async () => {
    const fakeOutput = new FakeOutput();
    const navigation = new GoNavigationService();
    const provider = new GeneratedGoImplementationProvider({
      navigation,
      output: fakeOutput,
      isTrusted: () => true,
      findDeclarationAt: () => ({ kind: "message", name: "UserResponse", line: 0, startCharacter: 8, endCharacter: 20 }),
      getWorkspaceFolder: () => ({ uri: { fsPath: "/workspace" } as vscode.Uri, name: "workspace", index: 0 }),
      findBufRoot: async () => Promise.resolve(undefined)
    });

    const doc = makeDoc("message UserResponse {}");
    const pos = { line: 0, character: 9 } as vscode.Position;
    const result = await provider.provideImplementation(doc, pos, makeToken());

    assert.strictEqual(result, undefined);
  });

  it("returns Location when navigation service finds implementation", async () => {
    const fakeOutput = new FakeOutput();
    const dummyNav = {
      find: async () => Promise.resolve({
        filePath: "/workspace/gen/proto-go/user.pb.go",
        location: { line: 42, startCharacter: 5, endCharacter: 17 }
      })
    } as unknown as GoNavigationService;

    const provider = new GeneratedGoImplementationProvider({
      navigation: dummyNav,
      output: fakeOutput,
      isTrusted: () => true,
      readConfig: (): BufBearConfig => ({
        lspEnabled: true,
        bufPath: "buf",
        traceServer: "off",
        missingBufNotification: true,
        goEnabled: true,
        goGenRoot: "gen/proto-go",
        goSourceRelative: true,
        conflictWarningEnabled: true
      }),
      findDeclarationAt: (): ProtoDeclaration => ({
        kind: "message",
        name: "UserResponse",
        line: 0,
        startCharacter: 8,
        endCharacter: 20
      }),
      getWorkspaceFolder: () => ({ uri: { fsPath: "/workspace" } as vscode.Uri, name: "workspace", index: 0 }),
      findBufRoot: async () => Promise.resolve("/workspace")
    });

    const doc = makeDoc("message UserResponse {}");
    const pos = { line: 0, character: 9 } as vscode.Position;
    const location = await provider.provideImplementation(doc, pos, makeToken());

    assert.ok(location);
    assert.strictEqual(location.uri.fsPath, "/workspace/gen/proto-go/user.pb.go");
    assert.strictEqual(location.range.start.line, 42);
    assert.strictEqual(location.range.start.character, 5);
  });

  it("logs error and returns undefined when resolution throws unexpected error", async () => {
    const fakeOutput = new FakeOutput();
    const provider = new GeneratedGoImplementationProvider({
      navigation: new GoNavigationService(),
      output: fakeOutput,
      isTrusted: () => {
        throw new Error("unexpected disk failure");
      }
    });

    const doc = makeDoc("message UserResponse {}");
    const pos = { line: 0, character: 9 } as vscode.Position;
    const result = await provider.provideImplementation(doc, pos, makeToken());

    assert.strictEqual(result, undefined);
    assert.strictEqual(fakeOutput.logs.length, 1);
    assert.strictEqual(fakeOutput.logs[0]?.component, "GoNavigation");
    assert.ok(fakeOutput.logs[0].message.includes("unexpected disk failure"));
  });
});

describe("resolveGoImplementation", () => {
  it("returns no_declaration status when declaration is missing", async () => {
    const navigation = new GoNavigationService();
    const doc = makeDoc("syntax = \"proto3\";");
    const pos = { line: 0, character: 0 } as vscode.Position;

    const res = await resolveGoImplementation(doc, pos, undefined, {
      navigation,
      isTrusted: () => true,
      findDeclarationAt: () => undefined
    });

    assert.strictEqual(res.status, "no_declaration");
  });

  it("returns no_buf_root status when findBufRoot yields undefined", async () => {
    const navigation = new GoNavigationService();
    const doc = makeDoc("message UserResponse {}");
    const pos = { line: 0, character: 9 } as vscode.Position;

    const res = await resolveGoImplementation(doc, pos, undefined, {
      navigation,
      isTrusted: () => true,
      findDeclarationAt: () => ({ kind: "message", name: "UserResponse", line: 0, startCharacter: 8, endCharacter: 20 }),
      getWorkspaceFolder: () => ({ uri: { fsPath: "/workspace" } as vscode.Uri, name: "workspace", index: 0 }),
      findBufRoot: async () => Promise.resolve(undefined)
    });

    assert.strictEqual(res.status, "no_buf_root");
  });
});
