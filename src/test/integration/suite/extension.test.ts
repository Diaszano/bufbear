import * as path from "node:path";
import assert from "node:assert/strict";
import * as vscode from "vscode";

describe("BufBear Integration Test Suite", () => {
  it("activates the extension and registers commands", async () => {
    const ext = vscode.extensions.getExtension("diaszano.bufbear");
    assert.ok(ext, "Extension diaszano.bufbear should be present");
    await ext.activate();
    assert.strictEqual(ext.isActive, true);

    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes("bufBear.restartServer"), "bufBear.restartServer command should be registered");
    assert.ok(commands.includes("bufBear.showOutput"), "bufBear.showOutput command should be registered");
    assert.ok(commands.includes("bufBear.checkHealth"), "bufBear.checkHealth command should be registered");
    assert.ok(commands.includes("bufBear.openSettings"), "bufBear.openSettings command should be registered");
    assert.ok(commands.includes("bufBear.goToGeneratedImplementation"), "bufBear.goToGeneratedImplementation command should be registered");
  });

  it("assigns language id proto3 to .proto files", async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    assert.ok(workspaceFolders && workspaceFolders.length > 0);
    const folder = workspaceFolders[0];
    assert.ok(folder);
    const workspacePath = folder.uri.fsPath;

    const protoUri = vscode.Uri.file(path.join(workspacePath, "api/example/v1/example.proto"));
    const document = await vscode.workspace.openTextDocument(protoUri);
    assert.strictEqual(document.languageId, "proto3");
  });
});
