import assert from "node:assert/strict";
import * as path from "node:path";
import * as vscode from "vscode";

describe("Protobuf Formatting Integration Tests", () => {
  const workspacePath =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
    path.resolve(__dirname, "../../../../src/test/fixtures/generated-go");
  const fixtureRoot = path.resolve(__dirname, "../../../../src/test/fixtures/formatting");
  const protoPath = path.join(fixtureRoot, "unformatted.proto");
  const expectedPath = path.join(fixtureRoot, "expected.proto");

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

    assert.ok(Array.isArray(edits), "Buf formatting should return edits");
    assert.strictEqual(edits.length, 1, "Expected one full-document formatting edit");
    const edit = edits[0];
    assert.ok(edit);
    assert.deepStrictEqual(edit.range.start, new vscode.Position(0, 0));
    assert.deepStrictEqual(edit.range.end, document.positionAt(document.getText().length));
    const expected = await vscode.workspace.fs.readFile(vscode.Uri.file(expectedPath));
    assert.strictEqual(edit.newText, Buffer.from(expected).toString("utf8"));
  });
});
