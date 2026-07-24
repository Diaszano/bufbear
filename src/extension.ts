import * as vscode from "vscode";
import { Output } from "./platform/output.js";
import { DefaultClientManager } from "./lsp/clientManager.js";
import { createLanguageClient } from "./lsp/clientFactory.js";
import { probeBuf } from "./lsp/bufExecutable.js";
import { findBufRoot } from "./lsp/rootDiscovery.js";
import { StatusBar, isBufOrProtoDocument } from "./ui/statusBar.js";
import { registerCommands } from "./ui/commands.js";
import { checkConflicts } from "./ui/conflictDetector.js";
import { GoNavigationService } from "./navigation/go/navigationService.js";
import { GeneratedGoImplementationProvider } from "./navigation/go/implementationProvider.js";
import { BufFormattingProvider } from "./formatting/formatProvider.js";
import { BufLintCodeActionProvider } from "./ui/codeActions.js";

import { registerWorkspaceWatchers } from "./ui/workspaceWatchers.js";

let shutdown: (() => Promise<void>) | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const output = new Output();
  const navigation = new GoNavigationService();

  registerWorkspaceWatchers(context, navigation, undefined, { api: vscode });

  const manager = new DefaultClientManager({
    output,
    createClient: createLanguageClient,
    probeBuf,
    findRoot: findBufRoot,
    isTrusted: () => vscode.workspace.isTrusted,
    showNotification: async (message: string, ...actions: string[]) => {
      return vscode.window.showInformationMessage(message, ...actions);
    }
  });

  const statusBar = new StatusBar({
    clientManager: manager
  });

  const commandDisposable = registerCommands({
    clientManager: manager,
    output,
    navigation
  });

  context.subscriptions.push(output);
  context.subscriptions.push(statusBar);
  context.subscriptions.push(commandDisposable);

  context.subscriptions.push(
    vscode.languages.registerImplementationProvider(
      { language: "proto3", scheme: "file" },
      new GeneratedGoImplementationProvider({ navigation, output })
    )
  );

  const formattingProvider = new BufFormattingProvider({
    writeLog: (level, component, message, root) => output.write(level, component, message, root)
  });

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider({ language: "proto3", scheme: "file" }, formattingProvider),
    vscode.languages.registerDocumentRangeFormattingEditProvider({ language: "proto3", scheme: "file" }, formattingProvider)
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: "proto3", scheme: "file" },
      new BufLintCodeActionProvider(),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
      }
    )
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isBufOrProtoDocument(editor.document)) {
        void manager.ensureForDocument(editor.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isBufOrProtoDocument(document)) {
        void manager.ensureForDocument(document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      statusBar.update();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("bufBear")) {
        const activeDoc = vscode.window.activeTextEditor?.document;
        void manager.restartForResource(activeDoc?.uri, "configuration changed");
        statusBar.update();
      }
    })
  );

  if ("onDidGrantWorkspaceTrust" in vscode.workspace) {
    context.subscriptions.push(
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (isBufOrProtoDocument(editor.document)) {
            void manager.ensureForDocument(editor.document);
          }
        }
        statusBar.update();
      })
    );
  }

  void checkConflicts();

  for (const editor of vscode.window.visibleTextEditors) {
    if (isBufOrProtoDocument(editor.document)) {
      void manager.ensureForDocument(editor.document);
    }
  }

  shutdown = async (): Promise<void> => {
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
    await Promise.race([manager.stopAll(), timeout]);
  };
}

export async function deactivate(): Promise<void> {
  await shutdown?.();
}
