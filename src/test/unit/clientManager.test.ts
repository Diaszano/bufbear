import assert from "node:assert/strict";
import type * as vscode from "vscode";
import { createClientManager, type ClientManagerDependencies } from "../../lsp/clientManager.js";
import type { BufProbe } from "../../lsp/bufExecutable.js";
import type { BufBearConfig } from "../../config/types.js";
import type { LanguageClient } from "vscode-languageclient/node";

class FakeOutput {
  public logs: { level: string; component: string; message: string; root?: string | undefined }[] = [];

  public write(level: "debug" | "info" | "warn" | "error", component: string, message: string, root?: string): void {
    this.logs.push({ level, component, message, root });
  }

  public show(): void {
    // no-op for mock channel
  }

  public dispose(): void {
    // no-op for mock channel
  }
}

class FakeLanguageClient {
  public isStarted = false;
  public isStopped = false;
  public stopDelayMs = 0;
  private listeners: ((e: { oldState: number; newState: number }) => void)[] = [];

  public onDidChangeState(listener: (e: { oldState: number; newState: number }) => void): { dispose(): void } {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) this.listeners.splice(idx, 1);
      }
    };
  }

  public async start(): Promise<void> {
    this.isStarted = true;
    return Promise.resolve();
  }

  public async stop(): Promise<void> {
    if (this.stopDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.stopDelayMs));
    }
    this.isStopped = true;
  }

  public triggerUnexpectedStop(): void {
    for (const listener of [...this.listeners]) {
      listener({ oldState: 2 /* Running */, newState: 1 /* Stopped */ });
    }
  }
}

function createDefaultConfig(overrides: Partial<BufBearConfig> = {}): BufBearConfig {
  return {
    lspEnabled: true,
    bufPath: "buf",
    traceServer: "off",
    missingBufNotification: true,
    goEnabled: true,
    goGenRoot: "gen/proto-go",
    goSourceRelative: true,
    conflictWarningEnabled: true,
    ...overrides
  };
}

function makeDoc(filePath: string, languageId = "proto3", scheme = "file"): vscode.TextDocument {
  return {
    uri: { fsPath: filePath, scheme } as vscode.Uri,
    languageId
  } as unknown as vscode.TextDocument;
}

function makeUri(filePath: string): vscode.Uri {
  return { fsPath: filePath, scheme: "file" } as unknown as vscode.Uri;
}

describe("ClientManager", () => {
  let fakeOutput: FakeOutput;
  let createdClients: FakeLanguageClient[];
  let probeCalls: string[];
  let rootMap: Map<string, string>;
  let config: BufBearConfig;
  let isTrustedValue: boolean;
  let notifications: string[];

  beforeEach(() => {
    fakeOutput = new FakeOutput();
    createdClients = [];
    probeCalls = [];
    rootMap = new Map();
    config = createDefaultConfig();
    isTrustedValue = true;
    notifications = [];
  });

  function createDeps(overrides: Partial<ClientManagerDependencies> = {}): ClientManagerDependencies {
    return {
      output: fakeOutput,
      createClient: () => {
        const client = new FakeLanguageClient();
        createdClients.push(client);
        return client as unknown as LanguageClient;
      },
      probeBuf: (executable: string) => {
        probeCalls.push(executable);
        return Promise.resolve({ executable, version: "1.30.0", supportsLsp: true } satisfies BufProbe);
      },
      findRoot: (filePath: string) => Promise.resolve(rootMap.get(filePath) ?? "/workspace/root"),
      isTrusted: () => isTrustedValue,
      readConfig: () => config,
      showNotification: (msg: string) => {
        notifications.push(msg);
        return Promise.resolve(undefined);
      },
      getWorkspaceFolder: () => "/workspace",
      ...overrides
    };
  }

  it("creates one client for repeated documents under the same root", async () => {
    rootMap.set("/workspace/root/a.proto", "/workspace/root");
    rootMap.set("/workspace/root/b.proto", "/workspace/root");

    const manager = createClientManager(createDeps());

    await manager.ensureForDocument(makeDoc("/workspace/root/a.proto"));
    await manager.ensureForDocument(makeDoc("/workspace/root/b.proto"));

    assert.equal(createdClients.length, 1);
    assert.equal(manager.statuses().length, 1);
    assert.equal(manager.statuses()[0]?.state, "ready");
  });

  it("creates two clients for documents under two distinct roots", async () => {
    rootMap.set("/workspace/repoA/a.proto", "/workspace/repoA");
    rootMap.set("/workspace/repoB/b.proto", "/workspace/repoB");

    const manager = createClientManager(createDeps());

    await manager.ensureForDocument(makeDoc("/workspace/repoA/a.proto"));
    await manager.ensureForDocument(makeDoc("/workspace/repoB/b.proto"));

    assert.equal(createdClients.length, 2);
    assert.equal(manager.statuses().length, 2);
  });

  it("does not create a client when LSP is disabled in configuration", async () => {
    config = createDefaultConfig({ lspEnabled: false });

    const manager = createClientManager(createDeps());
    await manager.ensureForDocument(makeDoc("/workspace/root/a.proto"));

    assert.equal(createdClients.length, 0);
    assert.equal(manager.statuses().length, 0);
  });

  it("does not create a client when workspace is untrusted", async () => {
    isTrustedValue = false;

    const manager = createClientManager(createDeps());
    await manager.ensureForDocument(makeDoc("/workspace/root/a.proto"));

    assert.equal(createdClients.length, 0);
    assert.equal(manager.statuses().length, 0);
  });

  it("restarts only the affected root when restarting for a specific resource", async () => {
    rootMap.set("/workspace/repoA/a.proto", "/workspace/repoA");
    rootMap.set("/workspace/repoB/b.proto", "/workspace/repoB");

    const manager = createClientManager(createDeps());

    await manager.ensureForDocument(makeDoc("/workspace/repoA/a.proto"));
    await manager.ensureForDocument(makeDoc("/workspace/repoB/b.proto"));

    assert.equal(createdClients.length, 2);
    const clientA = createdClients[0];
    const clientB = createdClients[1];
    assert.ok(clientA);
    assert.ok(clientB);

    await manager.restartForResource(makeUri("/workspace/repoA/a.proto"));

    assert.equal(clientA.isStopped, true);
    assert.equal(clientB.isStopped, false);
    assert.equal(createdClients.length, 3);
  });

  it("waits for every fake client when stopping all clients", async () => {
    rootMap.set("/workspace/repoA/a.proto", "/workspace/repoA");
    rootMap.set("/workspace/repoB/b.proto", "/workspace/repoB");

    const manager = createClientManager(createDeps());

    await manager.ensureForDocument(makeDoc("/workspace/repoA/a.proto"));
    await manager.ensureForDocument(makeDoc("/workspace/repoB/b.proto"));

    const clientA = createdClients[0];
    const clientB = createdClients[1];
    assert.ok(clientA);
    assert.ok(clientB);
    clientA.stopDelayMs = 20;
    clientB.stopDelayMs = 20;

    await manager.stopAll();

    assert.equal(clientA.isStopped, true);
    assert.equal(clientB.isStopped, true);
    assert.equal(manager.statuses().length, 0);
  });

  it("handles a failed probe cleanly by transitioning to degraded state without unhandled rejection", async () => {
    const deps = createDeps({
      probeBuf: (executable: string) => Promise.resolve({
        executable,
        version: "1.0.0",
        supportsLsp: false
      })
    });

    const manager = createClientManager(deps);

    await manager.ensureForDocument(makeDoc("/workspace/root/a.proto"));

    assert.equal(createdClients.length, 0);
    assert.equal(manager.statuses().length, 1);
    assert.equal(manager.statuses()[0]?.state, "degraded");
    assert.equal(notifications.length, 1);

    // Opening another document under same root does not trigger second notification
    await manager.ensureForDocument(makeDoc("/workspace/root/b.proto"));
    assert.equal(notifications.length, 1);
  });

  it("stops automatic retries after restart policy is exhausted", async () => {
    const manager = createClientManager(createDeps());

    await manager.ensureForDocument(makeDoc("/workspace/root/a.proto"));
    assert.equal(createdClients.length, 1);

    const client = createdClients[0];
    assert.ok(client);

    // Trigger unexpected stops repeatedly
    // RestartPolicy defaults: 4 retries allowed within window (at index 0, 1, 2, 3), 5th is undefined
    client.triggerUnexpectedStop(); // retry 1
    client.triggerUnexpectedStop(); // retry 2
    client.triggerUnexpectedStop(); // retry 3
    client.triggerUnexpectedStop(); // retry 4
    client.triggerUnexpectedStop(); // retry 5 -> exhausted

    const status = manager.statuses().find((s: { root: string }) => s.root === "/workspace/root");
    assert.ok(status);
    assert.equal(status.state, "error");
    assert.match(status.detail ?? "", /maximum restart retries exceeded/i);
  });
});
