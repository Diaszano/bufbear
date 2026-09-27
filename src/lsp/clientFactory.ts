import * as cp from "node:child_process";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  RevealOutputChannelOn,
  Trace,
  type LanguageClientOptions,
  type ServerOptions,
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

  const serverOptions: ServerOptions = () => {
    const child = cp.spawn(input.executable, ["lsp", "serve"], {
      cwd: input.root.fsPath,
      shell: false,
    });

    // Prevent an unhandled 'error' event (e.g. ENOENT when the configured
    // Buf binary disappears) from crashing the extension host. The language
    // client surfaces the failure through its own start/error handling.
    child.on("error", (err: NodeJS.ErrnoException) => {
      input.output.write(
        "error",
        "BufBear LSP",
        `Failed to spawn Buf LSP server (${input.executable}): ${err.message}`,
        input.root.fsPath,
      );
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString("utf8").trim();
      if (text) {
        input.output.write("warn", "BufBear LSP", text, input.root.fsPath);
      }
    });

    return Promise.resolve({
      writer: child.stdin,
      reader: child.stdout,
    });
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "proto3", scheme: "file" }],
    workspaceFolder: {
      uri: input.root,
      name: rootName,
      index: 0,
    },
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(input.root, "**/{*.proto,buf.yaml,buf.gen.yaml,buf.lock}"),
      ),
    },
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    outputChannel: vscode.window.createOutputChannel(`BufBear LSP — ${rootName}`, { log: true }),
    traceOutputChannel: vscode.window.createOutputChannel(`BufBear LSP Trace — ${rootName}`, { log: true }),
  };

  const client = new LanguageClient(
    `bufBear:${input.root.fsPath}`,
    `BufBear LSP (${rootName})`,
    serverOptions,
    clientOptions,
  );

  void client.setTrace(Trace.fromString(input.trace));

  return client;
}
