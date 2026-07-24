import assert from "node:assert/strict";
import { registerWorkspaceWatchers } from "../../ui/workspaceWatchers.js";
import { findBufRoot, invalidateRootCache } from "../../lsp/rootDiscovery.js";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

class Emitter<T> {
  listeners: Array<(v: T) => void> = [];
  event = (cb: (v: T) => void) => { this.listeners.push(cb); return { dispose: () => { this.listeners = this.listeners.filter((x) => x !== cb); } }; };
  fire(v: T) { for (const cb of [...this.listeners]) cb(v); }
}
class Watcher {
  create = new Emitter<any>(); change = new Emitter<any>(); delete = new Emitter<any>(); disposed = false;
  onDidCreate = this.create.event; onDidChange = this.change.event; onDidDelete = this.delete.event;
  dispose() { this.disposed = true; }
}
class Disposable { constructor(private readonly fn: () => void) {} dispose() { this.fn(); } }

function harness(useRootOverride = true) {
  const folders = [{ uri: { fsPath: "/workspace", toString: () => "file:///workspace" } }];
  const folderChanges = new Emitter<unknown>(); const configChanges = new Emitter<unknown>();
  const created: Watcher[] = [];
  const api = { workspace: { workspaceFolders: folders, createFileSystemWatcher: () => { const w = new Watcher(); created.push(w); return w; }, onDidChangeWorkspaceFolders: folderChanges.event, onDidChangeConfiguration: configChanges.event }, RelativePattern: class { constructor(public folder: unknown, public pattern: string) {} }, Disposable } as any;
  const context = { subscriptions: [] as any[] } as any;
  const navigation = { invalidate: (p: string) => invalidated.push(p) } as any;
  const invalidated: string[] = []; const roots: number[] = [];
  const registration = registerWorkspaceWatchers(context, navigation, undefined, useRootOverride ? { api, invalidateRoots: () => roots.push(1) } : { api });
  return { created, folderChanges, configChanges, registration, roots, invalidated, context };
}

describe("workspace watchers", () => {
  it("invalidates roots for metadata lifecycle and disposes/rebuilds", () => {
    const h = harness(); const metadata = h.created[0]!;
    metadata.create.fire(undefined); metadata.change.fire(undefined); metadata.delete.fire(undefined);
    assert.equal(h.roots.length, 3);
    h.folderChanges.fire({});
    assert.equal(metadata.disposed, true);
    assert.ok(h.created.length > 1);
    h.registration.dispose();
    assert.equal(h.created.at(-1)!.disposed, true);
  });
  it("invalidates generated navigation for create/change/delete", () => {
    const h = harness();
    assert.ok(h.created.length >= 2);
    const generated = h.created[1]!;
    generated.change.fire({ fsPath: "/workspace/gen/proto-go/service.pb.go" });
    generated.create.fire({ fsPath: "/workspace/gen/proto-go/service2.pb.go" });
    assert.deepEqual(h.invalidated, ["/workspace/gen/proto-go/service.pb.go", "/workspace/gen/proto-go/service2.pb.go"]);
  });

  it("refreshes nested root after buf.yaml metadata event", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bufbear-nested-"));
    const nested = path.join(root, "nested"); await fs.mkdir(nested);
    const proto = path.join(nested, "service.proto"); await fs.writeFile(proto, "syntax = \"proto3\";");
    invalidateRootCache();
    assert.equal(await findBufRoot(proto, root), root);
    const h = harness(false);
    await fs.writeFile(path.join(nested, "buf.yaml"), "version: v1\n");
    h.created[0]!.create.fire(undefined);
    assert.equal(await findBufRoot(proto, root), nested);
    await fs.rm(root, { recursive: true, force: true }); invalidateRootCache();
  });
});
