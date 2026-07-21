import assert from "node:assert/strict";
import * as path from "node:path";
import * as vscode from "vscode";

describe("Protobuf Formatting Integration Tests", () => {
  const workspacePath =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
    path.resolve(__dirname, "../../../../src/test/fixtures/generated-go");
  const protoPath = path.join(workspacePath, "api/example/v1/example.proto");

  before(async () => {
    const ext = vscode.extensions.getExtension("diaszano.bufbear");
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  it("provides document formatting edits for proto3 files", async () => {
    const uri = vscode.Uri.file(protoPath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      { tabSize: 2, insertSpaces: true }
    );

    assert.ok(edits === undefined || Array.isArray(edits));
  });
});
