import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  RevealOutputChannelOn,
  Trace,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions
} from "vscode-languageclient/node";
import type { Output } from "../platform/output.js";

export interface ClientFactoryInput {
  root: vscode.Uri;
  executable: string;
  trace: "off" | "messages" | "verbose";
  output: Pick<Output, "write" | "show" | "dispose">;
}

export function createLanguageClient(input: ClientFactoryInput): LanguageClient {
  const rootName = path.basename(input.root.fsPath);

  const serverOptions: ServerOptions = {
    run: {
      command: input.executable,
      args: ["lsp", "serve"],
      options: { cwd: input.root.fsPath, shell: false },
      transport: TransportKind.stdio
    },
    debug: {
      command: input.executable,
      args: ["lsp", "serve", "--debug"],
      options: { cwd: input.root.fsPath, shell: false },
      transport: TransportKind.stdio
    }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "proto3", scheme: "file" }],
    workspaceFolder: {
      uri: input.root,
      name: rootName,
      index: 0
    },
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(input.root, "**/{*.proto,buf.yaml,buf.gen.yaml,buf.lock}")
      )
    },
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    outputChannel: vscode.window.createOutputChannel(`BufBear LSP — ${rootName}`, { log: true }),
    traceOutputChannel: vscode.window.createOutputChannel(`BufBear LSP Trace — ${rootName}`, { log: true })
  };

  const client = new LanguageClient(
    `bufBear:${input.root.fsPath}`,
    `BufBear LSP (${rootName})`,
    serverOptions,
    clientOptions
  );

  void client.setTrace(Trace.fromString(input.trace));

  return client;
}
