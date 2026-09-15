import * as path from "node:path";
import type * as vscode from "vscode";
import type { ClientManager } from "../lsp/clientManager.js";
import type { Output } from "../platform/output.js";
import { probeBuf, type BufProbe } from "../lsp/bufExecutable.js";
import { findBufRoot } from "../lsp/rootDiscovery.js";
import { readConfig } from "../config/config.js";
import { GoNavigationService } from "../navigation/go/navigationService.js";
import { resolveGoImplementation } from "../navigation/go/implementationProvider.js";
import { formatProtoText } from "../formatting/bufFormatter.js";
import { getVscode } from "../platform/vscodeRef.js";

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
  readonly readConfig?: typeof readConfig;
  readonly formatProtoText?: typeof formatProtoText;
  readonly vscode?: typeof vscode;
}

export function registerCommands(dependencies: CommandDependencies): vscode.Disposable {
  const vsc = dependencies.vscode ?? getVscode();
  if (!vsc) {
    throw new Error("VS Code API required outside VS Code environment");
  }

  const disposables: vscode.Disposable[] = [];
  const readCfg = dependencies.readConfig ?? readConfig;

  // 1. bufBear.restartServer
  disposables.push(
    vsc.commands.registerCommand("bufBear.restartServer", async (resourceArg?: unknown) => {
      let resource: vscode.Uri | undefined;
      if (resourceArg && typeof resourceArg === "object" && "fsPath" in resourceArg) {
        resource = resourceArg as vscode.Uri;
      } else {
        resource = vsc.window.activeTextEditor?.document.uri;
      }
      dependencies.output.write("info", "Commands", "Manual restart requested", resource?.fsPath);
      await dependencies.clientManager.restartForResource(resource, "manual restart");
    })
  );

  // 2. bufBear.showOutput
  disposables.push(
    vsc.commands.registerCommand("bufBear.showOutput", () => {
      dependencies.output.show();
    })
  );

  // 3. bufBear.checkHealth
  disposables.push(
    vsc.commands.registerCommand("bufBear.checkHealth", async (resourceArg?: unknown) => {
      let resource: vscode.Uri | undefined;
      if (resourceArg && typeof resourceArg === "object" && "fsPath" in resourceArg) {
        resource = resourceArg as vscode.Uri;
      } else {
        resource = vsc.window.activeTextEditor?.document.uri;
      }

      const trusted = vsc.workspace.isTrusted ? "yes" : "no";

      let resourcePath = "<none>";
      if (resource) {
        resourcePath = vsc.workspace.asRelativePath(resource, false);
      }

      const config = readCfg(resource);

      let rootPath = "<none>";
      let probe: BufProbe | undefined;
      const findRootFn = dependencies.findRoot ?? findBufRoot;

      if (resource) {
        // Bound the upward search to the resource's workspace folder so a
        // stray buf.yaml above the workspace cannot be picked up.
        const boundary = vsc.workspace.getWorkspaceFolder(resource)?.uri.fsPath;
        const foundRoot = await findRootFn(resource.fsPath, boundary);
        if (foundRoot) {
          rootPath = vsc.workspace.asRelativePath(vsc.Uri.file(foundRoot), false);
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
    vsc.commands.registerCommand("bufBear.openSettings", async () => {
      await vsc.commands.executeCommand("workbench.action.openSettings", "@ext:diaszano.bufbear");
    })
  );

  // 5. bufBear.goToGeneratedImplementation
  disposables.push(
    vsc.commands.registerCommand("bufBear.goToGeneratedImplementation", async () => {
      const editor = vsc.window.activeTextEditor;

      if (!editor?.document.fileName.endsWith(".proto")) {
        await vsc.window.showInformationMessage("Place the cursor on a message, enum, service, or rpc declaration.");
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
          isTrusted: () => vsc.workspace.isTrusted
        }
      );

      if (res.status === "no_declaration") {
        await vsc.window.showInformationMessage("Place the cursor on a message, enum, service, or rpc declaration.");
        return;
      }

      if (res.status === "no_buf_root") {
        await vsc.window.showInformationMessage("No Buf module root was found.");
        return;
      }

      if (res.status !== "success") {
        await vsc.window.showInformationMessage(
          "Generated Go file or symbol was not found. Run code generation or check bufBear.go.genRoot."
        );
        return;
      }

      const targetUri = vsc.Uri.file(res.result.filePath);
      const targetPos = new vsc.Position(res.result.location.line, res.result.location.startCharacter);
      const targetRange = new vsc.Range(targetPos, targetPos);

      const targetDoc = await vsc.workspace.openTextDocument(targetUri);
      await vsc.window.showTextDocument(targetDoc, {
        selection: targetRange,
        preview: true
      });
    })
  );

  // 6. bufBear.showQuickPick
  disposables.push(
    vsc.commands.registerCommand("bufBear.showQuickPick", async () => {
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

      const selected = (await vsc.window.showQuickPick(items as unknown as vscode.QuickPickItem[])) as
        | QuickPickCommandItem
        | undefined;
      if (selected?.command) {
        await vsc.commands.executeCommand(selected.command);
      }
    })
  );

  // 7. bufBear.formatDocument
  disposables.push(
    vsc.commands.registerCommand("bufBear.formatDocument", async () => {
      const editor = vsc.window.activeTextEditor;
      if (editor?.document.languageId !== "proto3") {
        await vsc.window.showWarningMessage("Active editor is not a Protobuf file.");
        return;
      }

      if (!vsc.workspace.isTrusted) {
        await vsc.window.showInformationMessage("BufBear document formatting is disabled in untrusted workspaces.");
        return;
      }

      const config = readCfg(editor.document.uri);
      if (!config.formattingEnabled) {
        await vsc.window.showInformationMessage(
          'BufBear document formatting is disabled. Set "bufBear.formatting.enabled": true in Settings to re-enable it.'
        );
        return;
      }

      const findRootFn = dependencies.findRoot ?? findBufRoot;
      const document = editor.document;
      const workspaceFolder = vsc.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
      const bufRoot = await findRootFn(document.uri.fsPath, workspaceFolder);
      const cwd = bufRoot ?? workspaceFolder ?? path.dirname(document.uri.fsPath);

      const formatFn = dependencies.formatProtoText ?? formatProtoText;
      const originalText = document.getText();
      const result = await formatFn({
        text: originalText,
        bufPath: config.bufPath,
        cwd
      });

      if (!result.success) {
        await vsc.window.showWarningMessage(`BufBear Formatting Error: ${result.error}`);
        return;
      }

      if (result.formattedText === originalText) {
        return;
      }

      const lastLineIndex = Math.max(0, editor.document.lineCount - 1);
      const lastLine = editor.document.lineAt(lastLineIndex);

      const fullRange = new vsc.Range(new vsc.Position(0, 0), lastLine.range.end);
      await editor.edit((builder) => builder.replace(fullRange, result.formattedText));
    })
  );

  return vsc.Disposable.from(...disposables);
}
