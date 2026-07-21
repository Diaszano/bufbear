import * as path from "node:path";
import type * as vscode from "vscode";
import type { State } from "vscode-languageclient/node";
import type { createLanguageClient } from "./clientFactory.js";
import type { probeBuf } from "./bufExecutable.js";
import type { findBufRoot } from "./rootDiscovery.js";
import { RestartPolicy } from "./restartPolicy.js";
import type { Output } from "../platform/output.js";
import type { RootServerStatus, ServerState } from "./serverState.js";
import type { readConfig } from "../config/config.js";
import type { BufBearConfig } from "../config/types.js";

export interface ClientManager {
  ensureForDocument(document: vscode.TextDocument): Promise<void>;
  restartForResource(resource?: vscode.Uri, reason?: string): Promise<void>;
  stopForRoot(root: string): Promise<void>;
  stopAll(): Promise<void>;
  statuses(): readonly RootServerStatus[];
  onDidChangeStatus: vscode.Event<readonly RootServerStatus[]>;
}

export interface ClientManagerDependencies {
  readonly output: Pick<Output, "write" | "show" | "dispose">;
  readonly createClient: typeof createLanguageClient;
  readonly probeBuf: typeof probeBuf;
  readonly findRoot: typeof findBufRoot;
  readonly isTrusted: () => boolean;
  readonly getWorkspaceFolder?: (uri: vscode.Uri) => string | undefined;
  readonly readConfig?: typeof readConfig;
  readonly showNotification?: (message: string, ...actions: string[]) => Promise<string | undefined>;
}

class SimpleEventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];

  public readonly event: vscode.Event<T> = (listener: (e: T) => void): vscode.Disposable => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) {
          this.listeners.splice(idx, 1);
        }
      }
    };
  };

  public fire(data: T): void {
    for (const listener of [...this.listeners]) {
      listener(data);
    }
  }

  public dispose(): void {
    this.listeners = [];
  }
}

interface ManagedRootClient {
  readonly root: string;
  readonly rootKey: string;
  state: ServerState;
  detail?: string | undefined;
  client?: ReturnType<typeof createLanguageClient> | undefined;
  readonly restartPolicy: RestartPolicy;
  restartTimer?: NodeJS.Timeout | undefined;
  isStopping: boolean;
  disposables: { dispose(): void }[];
}

function normalizeRootKey(rootPath: string): string {
  const resolved = path.resolve(rootPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export class DefaultClientManager implements ClientManager {
  readonly #deps: ClientManagerDependencies;
  readonly #clients = new Map<string, ManagedRootClient>();
  readonly #startupPromises = new Map<string, Promise<void>>();
  readonly #statusEmitter = new SimpleEventEmitter<readonly RootServerStatus[]>();
  readonly #notifiedMissingBuf = new Set<string>();

  public constructor(dependencies: ClientManagerDependencies) {
    this.#deps = dependencies;
  }

  public get onDidChangeStatus(): vscode.Event<readonly RootServerStatus[]> {
    return this.#statusEmitter.event;
  }

  public statuses(): readonly RootServerStatus[] {
    return Array.from(this.#clients.values()).map((m) => ({
      root: m.root,
      state: m.state,
      ...(m.detail ? { detail: m.detail } : {})
    }));
  }

  public async ensureForDocument(document: vscode.TextDocument): Promise<void> {
    if (document.uri.scheme !== "file" || document.languageId !== "proto3") {
      return;
    }

    const config = await this.getConfig(document.uri);
    if (!config.lspEnabled) {
      this.#deps.output.write("debug", "ClientManager", "LSP is disabled by configuration", document.uri.fsPath);
      return;
    }

    if (!this.#deps.isTrusted()) {
      this.#deps.output.write("warn", "ClientManager", "Workspace is untrusted; skipping LSP client creation", document.uri.fsPath);
      return;
    }

    const workspaceFolder = this.getWorkspaceFolder(document.uri);
    const root = await this.#deps.findRoot(document.uri.fsPath, workspaceFolder);
    if (!root) {
      this.#deps.output.write("debug", "ClientManager", "No Buf root found for file", document.uri.fsPath);
      return;
    }

    const rootKey = normalizeRootKey(root);
    const existing = this.#clients.get(rootKey);
    if (existing) {
      if (existing.state === "ready" || existing.state === "degraded") {
        return;
      }
      if (existing.state === "starting") {
        const pending = this.#startupPromises.get(rootKey);
        if (pending) {
          await pending;
        }
        return;
      }
    }

    const pending = this.#startupPromises.get(rootKey);
    if (pending) {
      await pending;
      return;
    }

    const promise = this.startRoot(rootKey, root, document.uri, config);
    this.#startupPromises.set(rootKey, promise);
    try {
      await promise;
    } finally {
      this.#startupPromises.delete(rootKey);
    }
  }

  public async restartForResource(resource?: vscode.Uri, reason?: string): Promise<void> {
    this.#deps.output.write("info", "ClientManager", `Restart requested${reason ? `: ${reason}` : ""}`);
    if (resource) {
      const config = await this.getConfig(resource);
      const workspaceFolder = this.getWorkspaceFolder(resource);
      const root = await this.#deps.findRoot(resource.fsPath, workspaceFolder);
      const rootPath = root ?? resource.fsPath;
      const rootKey = normalizeRootKey(rootPath);

      await this.stopForRoot(rootKey);
      this.#notifiedMissingBuf.delete(rootKey);
      await this.startRoot(rootKey, rootPath, resource, config);
    } else {
      const existingRoots = Array.from(this.#clients.values()).map((m) => ({ rootKey: m.rootKey, root: m.root }));
      await this.stopAll();
      this.#notifiedMissingBuf.clear();

      for (const { rootKey, root } of existingRoots) {
        const uri = { fsPath: root, scheme: "file" } as vscode.Uri;
        const config = await this.getConfig(uri);
        await this.startRoot(rootKey, root, uri, config);
      }
    }
  }

  public async stopForRoot(root: string): Promise<void> {
    const rootKey = normalizeRootKey(root);
    const managed = this.#clients.get(rootKey);
    if (!managed) {
      return;
    }

    managed.isStopping = true;
    if (managed.restartTimer) {
      clearTimeout(managed.restartTimer);
      managed.restartTimer = undefined;
    }

    for (const sub of managed.disposables) {
      try {
        sub.dispose();
      } catch {
        // ignore errors during disposal
      }
    }
    managed.disposables = [];

    if (managed.client) {
      try {
        await managed.client.stop();
      } catch (err) {
        this.#deps.output.write("error", "ClientManager", `Error stopping client for root ${managed.root}: ${String(err)}`, managed.root);
      }
    }

    managed.state = "stopped";
    managed.detail = undefined;
    this.#clients.delete(rootKey);
    this.emitStatuses();
  }

  public async stopAll(): Promise<void> {
    const clientsToStop = Array.from(this.#clients.values());
    for (const managed of clientsToStop) {
      managed.isStopping = true;
      if (managed.restartTimer) {
        clearTimeout(managed.restartTimer);
        managed.restartTimer = undefined;
      }
      for (const sub of managed.disposables) {
        try {
          sub.dispose();
        } catch {
          // ignore errors during disposal
        }
      }
      managed.disposables = [];
    }

    await Promise.all(
      clientsToStop.map(async (managed) => {
        if (managed.client) {
          try {
            await managed.client.stop();
          } catch (err) {
            this.#deps.output.write("error", "ClientManager", `Error stopping client: ${String(err)}`, managed.root);
          }
        }
        managed.state = "stopped";
      })
    );

    this.#clients.clear();
    this.#startupPromises.clear();
    this.emitStatuses();
  }

  private async getConfig(uri?: vscode.Uri): Promise<BufBearConfig> {
    if (this.#deps.readConfig) {
      return this.#deps.readConfig(uri);
    }
    const { readConfig } = await import("../config/config.js");
    return readConfig(uri);
  }

  private getWorkspaceFolder(uri: vscode.Uri): string | undefined {
    if (this.#deps.getWorkspaceFolder) {
      return this.#deps.getWorkspaceFolder(uri);
    }
    try {
      // Lazy load vscode in extension runtime
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vscodeModule = require("vscode") as typeof vscode;
      return vscodeModule.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
    } catch {
      return undefined;
    }
  }

  private async notifyMissingBuf(msg: string): Promise<void> {
    if (this.#deps.showNotification) {
      await this.#deps.showNotification(msg, "Learn More");
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vscodeModule = require("vscode") as typeof vscode;
      await vscodeModule.window.showInformationMessage(msg, "Learn More");
    } catch {
      // Ignore if outside vscode
    }
  }

  private emitStatuses(): void {
    this.#statusEmitter.fire(this.statuses());
  }

  private async startRoot(rootKey: string, rootPath: string, resource: vscode.Uri, config: BufBearConfig): Promise<void> {
    let managed = this.#clients.get(rootKey);
    if (!managed) {
      managed = {
        root: rootPath,
        rootKey,
        state: "starting",
        client: undefined,
        restartPolicy: new RestartPolicy(),
        restartTimer: undefined,
        isStopping: false,
        disposables: []
      };
      this.#clients.set(rootKey, managed);
    } else {
      managed.state = "starting";
      managed.detail = undefined;
      managed.isStopping = false;
    }

    this.emitStatuses();
    this.#deps.output.write("info", "ClientManager", `Starting Buf LSP client for root: ${rootPath}`, rootPath);

    let probeResult: Awaited<ReturnType<typeof probeBuf>> | undefined;
    try {
      probeResult = await this.#deps.probeBuf(config.bufPath);
    } catch (err) {
      this.#deps.output.write("warn", "ClientManager", `Buf probe failed: ${err instanceof Error ? err.message : String(err)}`, rootPath);
      probeResult = undefined;
    }

    if (!probeResult?.supportsLsp) {
      const detail = probeResult ? "Buf CLI does not support LSP" : "Buf CLI probe failed";
      managed.state = "degraded";
      managed.detail = detail;
      this.#deps.output.write("warn", "ClientManager", `Buf probe failed or lacks LSP support: ${detail}`, rootPath);
      this.emitStatuses();

      if (config.missingBufNotification && !this.#notifiedMissingBuf.has(rootKey)) {
        this.#notifiedMissingBuf.add(rootKey);
        await this.notifyMissingBuf("Buf CLI is missing or does not support LSP. Protobuf features will be degraded.");
      }
      return;
    }

    try {
      const client = this.#deps.createClient({
        root: resource,
        executable: config.bufPath,
        trace: config.traceServer,
        output: this.#deps.output
      });

      managed.client = client;
      const targetManaged = managed;
      if (typeof client.onDidChangeState === "function") {
        const sub = client.onDidChangeState((e) => {
          if (e.newState === (1 as State) && !targetManaged.isStopping) {
            void this.handleUnexpectedStop(targetManaged, config);
          }
        });
        managed.disposables.push(sub);
      }

      await client.start();
      managed.state = "ready";
      managed.detail = undefined;
      managed.restartPolicy.reset();
      this.#deps.output.write("info", "ClientManager", `Language client started for root: ${rootPath}`, rootPath);
      this.emitStatuses();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      managed.state = "error";
      managed.detail = errorMsg;
      this.#deps.output.write("error", "ClientManager", `Failed to start language client: ${errorMsg}`, rootPath);
      this.emitStatuses();
    }
  }

  private async handleUnexpectedStop(managed: ManagedRootClient, config: BufBearConfig): Promise<void> {
    if (managed.isStopping) {
      return;
    }

    const delay = managed.restartPolicy.recordFailure();
    if (delay === undefined) {
      managed.state = "error";
      managed.detail = "Server process crashed; maximum restart retries exceeded";
      this.#deps.output.write("error", "ClientManager", "Max restart retries exceeded for root", managed.root);
      this.emitStatuses();
      return;
    }

    managed.state = "error";
    managed.detail = `Server process crashed; retrying in ${String(delay)}ms`;
    this.#deps.output.write("warn", "ClientManager", `Language client stopped unexpectedly. Scheduling restart in ${String(delay)}ms`, managed.root);
    this.emitStatuses();

    if (managed.restartTimer) {
      clearTimeout(managed.restartTimer);
    }

    if (delay === 0) {
      managed.restartTimer = undefined;
      await this.startRoot(managed.rootKey, managed.root, { fsPath: managed.root, scheme: "file" } as vscode.Uri, config);
    } else {
      managed.restartTimer = setTimeout(async () => {
        managed.restartTimer = undefined;
        if (!managed.isStopping) {
          await this.startRoot(managed.rootKey, managed.root, { fsPath: managed.root, scheme: "file" } as vscode.Uri, config);
        }
      }, delay);
    }
  }
}

export function createClientManager(dependencies: ClientManagerDependencies): ClientManager {
  return new DefaultClientManager(dependencies);
}
