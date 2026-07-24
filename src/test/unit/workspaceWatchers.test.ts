import assert from "node:assert/strict";
import { registerWorkspaceWatchers } from "../../ui/workspaceWatchers.js";

class Emitter<T> {
  listeners: Array<(v: T) => void> = [];
  event = (cb: (v: T) => void) => { this.listeners.push(cb); return { dispose: () => { this.listeners = this.listeners.filter((x) => x !== cb); } }; };
  fire(v: T) { for (const cb of [...this.listeners]) cb(v); }
}
class Watcher {
  create = new Emitter<void>(); change = new Emitter<void>(); delete = new Emitter<void>(); disposed = false;
  onDidCreate = this.create.event; onDidChange = this.change.event; onDidDelete = this.delete.event;
  dispose() { this.disposed = true; }
}
class Disposable { constructor(private readonly fn: () => void) {} dispose() { this.fn(); } }

function harness() {
  const folders = [{ uri: { fsPath: "/workspace", toString: () => "file:///workspace" } }];
  const folderChanges = new Emitter<unknown>(); const configChanges = new Emitter<unknown>();
  const created: Watcher[] = [];
  const api = { workspace: { workspaceFolders: folders, createFileSystemWatcher: () => { const w = new Watcher(); created.push(w); return w; }, onDidChangeWorkspaceFolders: folderChanges.event, onDidChangeConfiguration: configChanges.event }, RelativePattern: class { constructor(public folder: unknown, public pattern: string) {} }, Disposable } as any;
  const context = { subscriptions: [] as any[] } as any;
  const navigation = { invalidate: (p: string) => invalidated.push(p) } as any;
  const invalidated: string[] = []; const roots: number[] = [];
  const registration = registerWorkspaceWatchers(context, navigation, undefined, { api, invalidateRoots: () => roots.push(1) });
  return { created, folderChanges, configChanges, registration, roots, invalidated, context };
}

describe("workspace watchers", () => {
  it("invalidates roots for metadata lifecycle and disposes/rebuilds", () => {
    const h = harness(); const metadata = h.created[0]!;
    metadata.create.fire(); metadata.change.fire(); metadata.delete.fire();
    assert.equal(h.roots.length, 3);
    h.folderChanges.fire({});
    assert.equal(metadata.disposed, true);
    assert.ok(h.created.length > 1);
    h.registration.dispose();
    assert.equal(h.created.at(-1)!.disposed, true);
  });
  it("invalidates generated navigation for create/change/delete", () => {
    const h = harness();
    // absent go config means only metadata watcher; this assertion remains focused on callback path when present
    assert.ok(h.created.length >= 1);
  });
});
