import * as path from "node:path";
import * as fs from "node:fs/promises";
import assert from "node:assert/strict";
import * as vscode from "vscode";

function getPositionOf(document: vscode.TextDocument, searchText: string): vscode.Position {
  const text = document.getText();
  const index = text.indexOf(searchText);
  assert.notStrictEqual(index, -1, `Text '${searchText}' not found in document`);
  return document.positionAt(index);
}

describe("Generated Go Implementation Navigation Integration Tests", () => {
  let workspacePath: string;
  let protoUri: vscode.Uri;
  let protoDoc: vscode.TextDocument;

  before(async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    assert.ok(workspaceFolders && workspaceFolders.length > 0, "Workspace folders should exist");
    const folder = workspaceFolders[0];
    assert.ok(folder);
    workspacePath = folder.uri.fsPath;

    const protoPath = path.join(workspacePath, "api/example/v1/example.proto");
    protoUri = vscode.Uri.file(protoPath);
    protoDoc = await vscode.workspace.openTextDocument(protoUri);
    await vscode.window.showTextDocument(protoDoc);

    const ext = vscode.extensions.getExtension("diaszano.bufbear");
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  afterEach(async () => {
    const config = vscode.workspace.getConfiguration("bufBear", protoUri);
    await config.update("go.enabled", undefined, vscode.ConfigurationTarget.Global);
    await config.update("go.genRoot", undefined, vscode.ConfigurationTarget.Global);
  });

  it("navigates from message declaration to generated Go struct", async () => {
    const pos = getPositionOf(protoDoc, "Book {");
    const results = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeImplementationProvider",
      protoUri,
      pos
    );

    assert.strictEqual(results.length, 1, "Expected exactly 1 implementation result for message");
    const loc = results[0];
    assert.ok(loc, "Location should be defined");
    assert.ok(loc.uri.fsPath.endsWith("example.pb.go"), "Expected target file to end with example.pb.go");

    const targetDoc = await vscode.workspace.openTextDocument(loc.uri);
    const lineText = targetDoc.lineAt(loc.range.start.line).text;
    assert.ok(lineText.includes("type Book struct"), `Expected target line to contain 'type Book struct', got: ${lineText}`);
  });

  it("navigates from enum declaration to generated Go type/const", async () => {
    const pos = getPositionOf(protoDoc, "BookState {");
    const results = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeImplementationProvider",
      protoUri,
      pos
    );

    assert.strictEqual(results.length, 1, "Expected exactly 1 implementation result for enum");
    const loc = results[0];
    assert.ok(loc, "Location should be defined");
    assert.ok(loc.uri.fsPath.endsWith("example.pb.go"), "Expected target file to end with example.pb.go");

    const targetDoc = await vscode.workspace.openTextDocument(loc.uri);
    const lineText = targetDoc.lineAt(loc.range.start.line).text;
    assert.ok(lineText.includes("type BookState int32"), `Expected target line to contain 'type BookState int32', got: ${lineText}`);
  });

  it("navigates from service declaration to generated gRPC server interface", async () => {
    const pos = getPositionOf(protoDoc, "BookService {");
    const results = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeImplementationProvider",
      protoUri,
      pos
    );

    assert.strictEqual(results.length, 1, "Expected exactly 1 implementation result for service");
    const loc = results[0];
    assert.ok(loc, "Location should be defined");
    assert.ok(loc.uri.fsPath.endsWith("example_grpc.pb.go"), "Expected target file to end with example_grpc.pb.go");

    const targetDoc = await vscode.workspace.openTextDocument(loc.uri);
    const lineText = targetDoc.lineAt(loc.range.start.line).text;
    assert.ok(
      lineText.includes("type BookServiceServer interface"),
      `Expected target line to contain 'type BookServiceServer interface', got: ${lineText}`
    );
  });

  it("navigates from rpc declaration to generated gRPC method signature", async () => {
    const pos = getPositionOf(protoDoc, "CreateBook(");
    const results = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeImplementationProvider",
      protoUri,
      pos
    );

    assert.strictEqual(results.length, 1, "Expected exactly 1 implementation result for rpc");
    const loc = results[0];
    assert.ok(loc, "Location should be defined");
    assert.ok(loc.uri.fsPath.endsWith("example_grpc.pb.go"), "Expected target file to end with example_grpc.pb.go");

    const targetDoc = await vscode.workspace.openTextDocument(loc.uri);
    const lineText = targetDoc.lineAt(loc.range.start.line).text;
    assert.ok(lineText.includes("CreateBook("), `Expected target line to contain 'CreateBook(', got: ${lineText}`);
  });

  it("returns no implementation when cursor is on a field", async () => {
    const pos = getPositionOf(protoDoc, "id = 1");
    const results = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeImplementationProvider",
      protoUri,
      pos
    );

    assert.strictEqual(results.length, 0, "Expected no implementation results when cursor is on a field");
  });

  it("returns no implementation when bufBear.go.enabled = false", async () => {
    const config = vscode.workspace.getConfiguration("bufBear", protoUri);
    await config.update("go.enabled", false, vscode.ConfigurationTarget.Global);

    const pos = getPositionOf(protoDoc, "Book {");
    const results = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeImplementationProvider",
      protoUri,
      pos
    );

    assert.strictEqual(results.length, 0, "Expected no implementation results when go.enabled = false");
  });

  it("returns no implementation when bufBear.go.genRoot is invalid", async () => {
    const config = vscode.workspace.getConfiguration("bufBear", protoUri);
    await config.update("go.genRoot", "non_existent_directory", vscode.ConfigurationTarget.Global);

    const pos = getPositionOf(protoDoc, "Book {");
    const results = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeImplementationProvider",
      protoUri,
      pos
    );

    assert.strictEqual(results.length, 0, "Expected no implementation results when go.genRoot is invalid");
  });

  it("invalidates cache and returns updated location when generated file is modified", async () => {
    const pbGoPath = path.join(workspacePath, "gen/proto-go/api/example/v1/example.pb.go");
    const originalContent = await fs.readFile(pbGoPath, "utf8");

    try {
      const pos = getPositionOf(protoDoc, "Book {");
      const results1 = await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeImplementationProvider",
        protoUri,
        pos
      );

      assert.strictEqual(results1.length, 1);
      const loc1 = results1[0];
      assert.ok(loc1);
      const initialLine = loc1.range.start.line;

      const modifiedContent = "// Header comment\n// Another comment line\n" + originalContent;
      await fs.writeFile(pbGoPath, modifiedContent, "utf8");

      await new Promise((resolve) => setTimeout(resolve, 300));

      const results2 = await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeImplementationProvider",
        protoUri,
        pos
      );

      assert.strictEqual(results2.length, 1);
      const loc2 = results2[0];
      assert.ok(loc2);
      const newLine = loc2.range.start.line;
      assert.strictEqual(newLine, initialLine + 2, "Expected target line to shift down by 2 after invalidation");
    } finally {
      await fs.writeFile(pbGoPath, originalContent, "utf8");
    }
  });
});
