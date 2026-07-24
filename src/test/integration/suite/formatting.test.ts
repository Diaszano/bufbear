import assert from "node:assert/strict";
import * as path from "node:path";
import * as vscode from "vscode";

describe("Protobuf Formatting Integration Tests", () => {
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
    const expected = await vscode.workspace.fs.readFile(vscode.Uri.file(expectedPath));
    const expectedText = Buffer.from(expected).toString("utf8");
    assert.ok(
      edits.some((candidate) => candidate.newText === expectedText),
      "Expected a formatting edit with Buf's formatted text"
    );
  });
});
