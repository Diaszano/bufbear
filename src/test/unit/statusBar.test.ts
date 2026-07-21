import assert from "node:assert/strict";
import type * as vscode from "vscode";
import { StatusBar } from "../../ui/statusBar.js";
import type { ClientManager } from "../../lsp/clientManager.js";
import type { RootServerStatus } from "../../lsp/serverState.js";

class FakeStatusBarItem implements vscode.StatusBarItem {
  public id = "bufbear.status";
  public alignment = 2; // Right
  public priority = 100;
  public name = "BufBear Status";
  public text = "";
  public tooltip = "";
  public color = undefined;
  public backgroundColor = undefined;
  public command = "";
  public isVisible = false;
  public accessibilityInformation = undefined;

  public show(): void {
    this.isVisible = true;
  }

  public hide(): void {
    this.isVisible = false;
  }

  public dispose(): void {
    this.isVisible = false;
  }
}

class FakeClientManager implements ClientManager {
  public currentStatuses: RootServerStatus[] = [];
  private listeners: ((statuses: readonly RootServerStatus[]) => void)[] = [];

  public async ensureForDocument(_document: vscode.TextDocument): Promise<void> {
    await Promise.resolve();
  }

  public async restartForResource(_resource?: vscode.Uri, _reason?: string): Promise<void> {
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
    listener: (statuses: readonly RootServerStatus[]) => void,
    _thisArgs?: unknown,
    disposables?: { dispose(): void }[]
  ): vscode.Disposable {
    this.listeners.push(listener);
    const sub = {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) this.listeners.splice(idx, 1);
      }
    };
    if (disposables) disposables.push(sub);
    return sub;
  }

  public triggerStatusChange(statuses: RootServerStatus[]): void {
    this.currentStatuses = statuses;
    for (const listener of [...this.listeners]) {
      listener(statuses);
    }
  }
}

describe("StatusBar", () => {
  it("hides status bar item when non-proto file is active", () => {
    const fakeItem = new FakeStatusBarItem();
    const fakeManager = new FakeClientManager();

    const statusBar = new StatusBar({
      createStatusBarItem: () => fakeItem,
      getActiveTextEditor: () =>
        ({
          document: {
            languageId: "typescript",
            fileName: "/workspace/index.ts",
            uri: { fsPath: "/workspace/index.ts" }
          }
        } as unknown as vscode.TextEditor),
      clientManager: fakeManager
    });

    statusBar.update();
    assert.strictEqual(fakeItem.isVisible, false);
    statusBar.dispose();
  });

  it("shows $(sync~spin) BufBear for starting state on proto file", () => {
    const fakeItem = new FakeStatusBarItem();
    const fakeManager = new FakeClientManager();
    fakeManager.currentStatuses = [{ root: "/workspace", state: "starting" }];

    const statusBar = new StatusBar({
      createStatusBarItem: () => fakeItem,
      getActiveTextEditor: () =>
        ({
          document: {
            languageId: "proto3",
            fileName: "/workspace/service.proto",
            uri: { fsPath: "/workspace/service.proto" }
          }
        } as unknown as vscode.TextEditor),
      clientManager: fakeManager
    });

    statusBar.update();
    assert.strictEqual(fakeItem.isVisible, true);
    assert.strictEqual(fakeItem.text, "$(sync~spin) BufBear");
    statusBar.dispose();
  });

  it("shows $(check) BufBear for ready state", () => {
    const fakeItem = new FakeStatusBarItem();
    const fakeManager = new FakeClientManager();
    fakeManager.currentStatuses = [{ root: "/workspace", state: "ready" }];

    const statusBar = new StatusBar({
      createStatusBarItem: () => fakeItem,
      getActiveTextEditor: () =>
        ({
          document: {
            languageId: "proto3",
            fileName: "/workspace/service.proto",
            uri: { fsPath: "/workspace/service.proto" }
          }
        } as unknown as vscode.TextEditor),
      clientManager: fakeManager
    });

    statusBar.update();
    assert.strictEqual(fakeItem.isVisible, true);
    assert.strictEqual(fakeItem.text, "$(check) BufBear");
    statusBar.dispose();
  });

  it("shows $(warning) BufBear for degraded state", () => {
    const fakeItem = new FakeStatusBarItem();
    const fakeManager = new FakeClientManager();
    fakeManager.currentStatuses = [{ root: "/workspace", state: "degraded", detail: "Buf version outdated" }];

    const statusBar = new StatusBar({
      createStatusBarItem: () => fakeItem,
      getActiveTextEditor: () =>
        ({
          document: {
            languageId: "proto3",
            fileName: "/workspace/service.proto",
            uri: { fsPath: "/workspace/service.proto" }
          }
        } as unknown as vscode.TextEditor),
      clientManager: fakeManager
    });

    statusBar.update();
    assert.strictEqual(fakeItem.isVisible, true);
    assert.strictEqual(fakeItem.text, "$(warning) BufBear");
    statusBar.dispose();
  });

  it("shows $(error) BufBear for error state", () => {
    const fakeItem = new FakeStatusBarItem();
    const fakeManager = new FakeClientManager();
    fakeManager.currentStatuses = [{ root: "/workspace", state: "error" }];

    const statusBar = new StatusBar({
      createStatusBarItem: () => fakeItem,
      getActiveTextEditor: () =>
        ({
          document: {
            languageId: "proto3",
            fileName: "/workspace/service.proto",
            uri: { fsPath: "/workspace/service.proto" }
          }
        } as unknown as vscode.TextEditor),
      clientManager: fakeManager
    });

    statusBar.update();
    assert.strictEqual(fakeItem.isVisible, true);
    assert.strictEqual(fakeItem.text, "$(error) BufBear");
    statusBar.dispose();
  });

  it("shows $(circle-slash) BufBear when untrusted or disabled", () => {
    const fakeItem = new FakeStatusBarItem();
    const fakeManager = new FakeClientManager();

    const statusBar = new StatusBar({
      createStatusBarItem: () => fakeItem,
      getActiveTextEditor: () =>
        ({
          document: {
            languageId: "proto3",
            fileName: "/workspace/service.proto",
            uri: { fsPath: "/workspace/service.proto" }
          }
        } as unknown as vscode.TextEditor),
      clientManager: fakeManager,
      isTrusted: () => false
    });

    statusBar.update();
    assert.strictEqual(fakeItem.isVisible, true);
    assert.strictEqual(fakeItem.text, "$(circle-slash) BufBear");
    statusBar.dispose();
  });

  it("updates automatically when client status changes", () => {
    const fakeItem = new FakeStatusBarItem();
    const fakeManager = new FakeClientManager();

    const statusBar = new StatusBar({
      createStatusBarItem: () => fakeItem,
      getActiveTextEditor: () =>
        ({
          document: {
            languageId: "proto3",
            fileName: "/workspace/service.proto",
            uri: { fsPath: "/workspace/service.proto" }
          }
        } as unknown as vscode.TextEditor),
      clientManager: fakeManager
    });

    statusBar.update();
    assert.strictEqual(fakeItem.text, "$(circle-slash) BufBear");

    fakeManager.triggerStatusChange([{ root: "/workspace", state: "ready" }]);
    assert.strictEqual(fakeItem.text, "$(check) BufBear");

    statusBar.dispose();
  });
});
