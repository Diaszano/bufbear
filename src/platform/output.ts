import * as vscode from "vscode";

export type LogLevel = "debug" | "info" | "warn" | "error";

export class Output implements vscode.Disposable {
  readonly #channel = vscode.window.createOutputChannel("BufBear");

  public write(level: LogLevel, component: string, message: string, root?: string): void {
    const timestamp = new Date().toISOString();
    const rootLabel = root ? ` [${root}]` : "";
    this.#channel.appendLine(`${timestamp} ${level.toUpperCase()}${rootLabel} [${component}] ${message}`);
  }

  public show(): void {
    this.#channel.show(true);
  }

  public dispose(): void {
    this.#channel.dispose();
  }
}
