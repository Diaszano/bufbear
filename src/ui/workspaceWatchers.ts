import * as vscode from "vscode";
import { invalidateRootCache } from "../lsp/rootDiscovery.js";
import { GoNavigationService } from "../navigation/go/navigationService.js";
import { readConfig } from "../config/config.js";

export interface WatcherFactory {
  (pattern: vscode.RelativePattern | vscode.GlobPattern): vscode.FileSystemWatcher;
}
export interface WorkspaceWatcherOptions { invalidateRoots?: () => void; }

export function registerWorkspaceWatchers(
  context: vscode.ExtensionContext,
  navigation: GoNavigationService,
  createWatcher: WatcherFactory = (pattern) => vscode.workspace.createFileSystemWatcher(pattern),
  options: WorkspaceWatcherOptions = {}
): vscode.Disposable {
  const watchers: vscode.Disposable[] = [];
  const subscriptions: vscode.Disposable[] = [];

  const disposeWatchers = () => {
    while (watchers.length) watchers.pop()?.dispose();
  };

  const update = () => {
    disposeWatchers();
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const metadata = createWatcher(new vscode.RelativePattern(folder, "**/{buf.yaml,buf.lock,buf.gen.yaml,buf.work.yaml}"));
      const invalidate = () => (options.invalidateRoots ?? invalidateRootCache)();
      metadata.onDidCreate(invalidate); metadata.onDidChange(invalidate); metadata.onDidDelete(invalidate);
      watchers.push(metadata);

      const config = readConfig(folder.uri);
      if (!config.goEnabled) continue;
      let root = config.goGenRoot.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
      if (root === ".") root = "";
      const escaped = root.replace(/[*?[\]{}]/g, "\\$&");
      const pattern = escaped ? `${escaped}/**/*.{pb.go,grpc.pb.go}` : "**/*.{pb.go,grpc.pb.go}";
      const generated = createWatcher(new vscode.RelativePattern(folder, pattern));
      const invalidateGenerated = (uri: vscode.Uri) => navigation.invalidate(uri.fsPath);
      generated.onDidCreate(invalidateGenerated); generated.onDidChange(invalidateGenerated); generated.onDidDelete(invalidateGenerated);
      watchers.push(generated);
    }
  };

  update();
  subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(update));
  subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("bufBear")) update();
  }));

  const registration = new vscode.Disposable(() => {
    subscriptions.splice(0).forEach((item) => item.dispose());
    disposeWatchers();
  });
  context.subscriptions.push(registration);
  return registration;
}
