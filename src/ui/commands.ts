import * as path from "node:path";
import type * as vscode from "vscode";
import type { ClientManager } from "../lsp/clientManager.js";
import type { Output } from "../platform/output.js";
import { probeBuf, type BufProbe } from "../lsp/bufExecutable.js";
import { findBufRoot } from "../lsp/rootDiscovery.js";
import { readConfig } from "../config/config.js";
import { GoNavigationService } from "../navigation/go/navigationService.js";
import { resolveGoImplementation } from "../navigation/go/implementationProvider.js";

function getVscode(): typeof vscode | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("vscode") as typeof vscode;
  } catch {
    return undefined;
  }
}

export interface QuickPickCommandItem {
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
  readonly command: string;
}

export interface CommandDependencies {
  readonly clientManager: ClientManager;
  readonly output: Pick<Output, "write" | "show" | "dispose">;
  readonly navigation?: GoNavigationService;
  readonly resolveGoImplementation?: typeof resolveGoImplementation;
  readonly probeBuf?: typeof probeBuf;
  readonly findRoot?: typeof findBufRoot;
  readonly isTrusted?: () => boolean;
  readonly readConfig?: typeof readConfig;
  readonly registerCommand?: (id: string, handler: (...args: unknown[]) => unknown) => vscode.Disposable;
  readonly executeCommand?: (command: string, ...rest: unknown[]) => Promise<unknown>;
  readonly showQuickPick?: (items: readonly QuickPickCommandItem[]) => Promise<QuickPickCommandItem | undefined>;
  readonly showInformationMessage?: (message: string) => Promise<string | undefined>;
  readonly getActiveTextEditor?: () => vscode.TextEditor | undefined;
  readonly openTextDocument?: (uri: vscode.Uri) => Promise<vscode.TextDocument>;
  readonly showTextDocument?: (
    document: vscode.TextDocument,
    options?: vscode.TextDocumentShowOptions
  ) => Promise<vscode.TextEditor>;
}

export function registerCommands(dependencies: CommandDependencies): vscode.Disposable {
  const vsc = getVscode();

  const regCmd =
    dependencies.registerCommand ??
    ((id: string, handler: (...args: unknown[]) => unknown) => {
      if (!vsc) {
        throw new Error("registerCommand dependency required outside VS Code environment");
      }
      return vsc.commands.registerCommand(id, handler);
    });

  const disposables: vscode.Disposable[] = [];

  const getEditor = dependencies.getActiveTextEditor ?? (() => vsc?.window.activeTextEditor);
  const readCfg = dependencies.readConfig ?? readConfig;

  // 1. bufBear.restartServer
  disposables.push(
    regCmd("bufBear.restartServer", async (resourceArg?: unknown) => {
      let resource: vscode.Uri | undefined;
      if (resourceArg && typeof resourceArg === "object" && "fsPath" in resourceArg) {
        resource = resourceArg as vscode.Uri;
      } else {
        resource = getEditor()?.document.uri;
      }
      dependencies.output.write("info", "Commands", "Manual restart requested", resource?.fsPath);
      await dependencies.clientManager.restartForResource(resource, "manual restart");
    })
  );

  // 2. bufBear.showOutput
  disposables.push(
    regCmd("bufBear.showOutput", () => {
      dependencies.output.show();
    })
  );

  // 3. bufBear.checkHealth
  disposables.push(
    regCmd("bufBear.checkHealth", async (resourceArg?: unknown) => {
      let resource: vscode.Uri | undefined;
      if (resourceArg && typeof resourceArg === "object" && "fsPath" in resourceArg) {
        resource = resourceArg as vscode.Uri;
      } else {
        resource = getEditor()?.document.uri;
      }

      const isTrustedFn = dependencies.isTrusted ?? (() => vsc?.workspace.isTrusted ?? true);
      const trusted = isTrustedFn() ? "yes" : "no";

      let resourcePath = "<none>";
      if (resource) {
        resourcePath = vsc ? vsc.workspace.asRelativePath(resource, false) : resource.fsPath;
      }

      const config = readCfg(resource);

      let rootPath = "<none>";
      let probe: BufProbe | undefined;
      const findRootFn = dependencies.findRoot ?? findBufRoot;

      if (resource) {
        const foundRoot = await findRootFn(resource.fsPath);
        if (foundRoot) {
          rootPath = vsc ? vsc.workspace.asRelativePath(vsc.Uri.file(foundRoot), false) : foundRoot;
        }
      }

      const probeFn = dependencies.probeBuf ?? probeBuf;
      try {
        probe = await probeFn(config.bufPath);
      } catch {
        probe = undefined;
      }

      const bufVersion = probe?.version ?? "unavailable";
      const lspSupport = probe?.supportsLsp ? "yes" : "no";

      const statuses = dependencies.clientManager.statuses();
      let clientState = "none";
      if (statuses.length > 0) {
        const resPath = resource?.fsPath;
        let matched = resPath
          ? statuses.find((s) => resPath === s.root || resPath.startsWith(s.root + path.sep))
          : undefined;

        if (!matched && statuses.length === 1) {
          matched = statuses[0];
        }

        if (matched) {
          clientState = matched.state;
        }
      }

      const reportLines = [
        "BufBear health",
        `- Workspace trusted: ${trusted}`,
        `- Resource: ${resourcePath}`,
        `- Root: ${rootPath}`,
        `- Buf executable: ${config.bufPath}`,
        `- Buf version: ${bufVersion}`,
        `- LSP support: ${lspSupport}`,
        `- Client state: ${clientState}`
      ];

      const reportText = reportLines.join("\n");
      dependencies.output.write("info", "Health", reportText);
      dependencies.output.show();
    })
  );

  // 4. bufBear.openSettings
  disposables.push(
    regCmd("bufBear.openSettings", async () => {
      const execCmd =
        dependencies.executeCommand ??
        ((cmd: string, ...rest: unknown[]) => vsc?.commands.executeCommand(cmd, ...rest) ?? Promise.resolve());
      await execCmd("workbench.action.openSettings", "@ext:diaszano.bufbear");
    })
  );

  // 5. bufBear.goToGeneratedImplementation
  disposables.push(
    regCmd("bufBear.goToGeneratedImplementation", async () => {
      const showInfo =
        dependencies.showInformationMessage ??
        ((msg: string) => vsc?.window.showInformationMessage(msg) ?? Promise.resolve(undefined));
      const editor = getEditor();

      if (!editor?.document.fileName.endsWith(".proto")) {
        await showInfo("Place the cursor on a message, enum, service, or rpc declaration.");
        return;
      }

      const resolveFn = dependencies.resolveGoImplementation ?? resolveGoImplementation;
      const navigation = dependencies.navigation ?? new GoNavigationService();
      const pos = editor.selection.active;

      const res = await resolveFn(
        editor.document,
        pos,
        undefined,
        {
          navigation,
          readConfig: dependencies.readConfig,
          findBufRoot: dependencies.findRoot,
          isTrusted: dependencies.isTrusted
        }
      );

      if (res.status === "no_declaration") {
        await showInfo("Place the cursor on a message, enum, service, or rpc declaration.");
        return;
      }

      if (res.status === "no_buf_root") {
        await showInfo("No Buf module root was found.");
        return;
      }

      if (res.status !== "success") {
        await showInfo("Generated Go file or symbol was not found. Run code generation or check bufBear.go.genRoot.");
        return;
      }

      const openDoc =
        dependencies.openTextDocument ??
        ((uri: vscode.Uri) => {
          if (!vsc) throw new Error("openTextDocument required outside VS Code environment");
          return vsc.workspace.openTextDocument(uri);
        });

      const showDoc =
        dependencies.showTextDocument ??
        ((doc: vscode.TextDocument, options?: vscode.TextDocumentShowOptions) => {
          if (!vsc) throw new Error("showTextDocument required outside VS Code environment");
          return vsc.window.showTextDocument(doc, options);
        });

      const targetUri = vsc ? vsc.Uri.file(res.result.filePath) : ({ fsPath: res.result.filePath } as vscode.Uri);
      const targetPos = vsc
        ? new vsc.Position(res.result.location.line, res.result.location.startCharacter)
        : ({ line: res.result.location.line, character: res.result.location.startCharacter } as vscode.Position);
      const targetRange = vsc ? new vsc.Range(targetPos, targetPos) : (targetPos as unknown as vscode.Range);

      const targetDoc = await openDoc(targetUri);
      await showDoc(targetDoc, {
        selection: targetRange,
        preview: true
      });
    })
  );

  // 6. bufBear.showQuickPick
  disposables.push(
    regCmd("bufBear.showQuickPick", async () => {
      const showQP =
        dependencies.showQuickPick ??
        ((items: readonly QuickPickCommandItem[]) =>
          vsc?.window.showQuickPick(items as unknown as vscode.QuickPickItem[]) as Promise<QuickPickCommandItem | undefined>);
      const execCmd =
        dependencies.executeCommand ??
        ((cmd: string, ...rest: unknown[]) => vsc?.commands.executeCommand(cmd, ...rest) ?? Promise.resolve());

      const items: QuickPickCommandItem[] = [
        {
          label: "$(heart) Check Health",
          description: "Run health check on active Buf environment",
          command: "bufBear.checkHealth"
        },
        {
          label: "$(restart) Restart Language Server",
          description: "Restart Buf Language Server for active workspace",
          command: "bufBear.restartServer"
        },
        {
          label: "$(output) Show Output Channel",
          description: "Open BufBear logs channel",
          command: "bufBear.showOutput"
        },
        {
          label: "$(gear) Open Settings",
          description: "Open BufBear configuration",
          command: "bufBear.openSettings"
        }
      ];

      const selected = await showQP(items);
      if (selected?.command) {
        await execCmd(selected.command);
      }
    })
  );

  return {
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    }
  };
}
