import type * as vscode from "vscode";

export function getVscode(): typeof vscode | undefined {
  try {
    return require("vscode") as typeof vscode;
  } catch {
    return undefined;
  }
}
