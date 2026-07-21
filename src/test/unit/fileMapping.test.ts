import assert from "node:assert/strict";
import path from "node:path";
import { mapToGeneratedGo } from "../../navigation/go/fileMapping.js";
import type { ProtoDeclaration } from "../../navigation/go/declaration.js";

const root = path.resolve("/workspace");
const moduleRoot = path.join(root, "proto");
const protoFile = path.join(moduleRoot, "api", "book", "v1", "book.proto");

function declaration(kind: ProtoDeclaration["kind"], name: string): ProtoDeclaration {
  return {
    kind,
    name,
    line: 0,
    startCharacter: 0,
    endCharacter: name.length,
    ...(kind === "rpc" ? { parentService: "BookService" } : {})
  };
}

describe("mapToGeneratedGo", () => {
  it("maps message to .pb.go", () => {
    const target = mapToGeneratedGo({
      workspaceRoot: root,
      moduleRoot,
      protoFile,
      generatedRoot: "gen/proto-go",
      declaration: declaration("message", "Book")
    });
    assert(target);
    assert.equal(
      target.filePath,
      path.join(moduleRoot, "gen", "proto-go", "api", "book", "v1", "book.pb.go")
    );
    assert.equal(target.symbolName, "Book");
    assert.equal(target.kind, "message");
  });

  it("maps enum to .pb.go", () => {
    const target = mapToGeneratedGo({
      workspaceRoot: root,
      moduleRoot,
      protoFile,
      generatedRoot: "gen/proto-go",
      declaration: declaration("enum", "BookState")
    });
    assert(target);
    assert.match(target.filePath, /book\.pb\.go$/u);
    assert.equal(target.symbolName, "BookState");
    assert.equal(target.kind, "enum");
  });

  it("maps service and rpc to _grpc.pb.go", () => {
    for (const kind of ["service", "rpc"] as const) {
      const target = mapToGeneratedGo({
        workspaceRoot: root,
        moduleRoot,
        protoFile,
        generatedRoot: "gen/proto-go",
        declaration: declaration(kind, kind === "service" ? "BookService" : "CreateBook")
      });
      assert(target);
      assert.match(target.filePath, /book_grpc\.pb\.go$/u);
      assert.equal(target.kind, kind);
      if (kind === "rpc") {
        assert.equal(target.parentService, "BookService");
      }
    }
  });

  it("rejects generated roots that escape the workspace", () => {
    const target = mapToGeneratedGo({
      workspaceRoot: root,
      moduleRoot,
      protoFile,
      generatedRoot: "../../outside",
      declaration: declaration("message", "Book")
    });
    assert.equal(target, undefined);
  });

  it("rejects proto files outside the module root", () => {
    const target = mapToGeneratedGo({
      workspaceRoot: root,
      moduleRoot,
      protoFile: path.resolve("/other/book.proto"),
      generatedRoot: "gen/proto-go",
      declaration: declaration("message", "Book")
    });
    assert.equal(target, undefined);
  });

  it("rejects module root outside workspace root", () => {
    const target = mapToGeneratedGo({
      workspaceRoot: root,
      moduleRoot: path.resolve("/outside/proto"),
      protoFile: path.resolve("/outside/proto/api/book.proto"),
      generatedRoot: "gen/proto-go",
      declaration: declaration("message", "Book")
    });
    assert.equal(target, undefined);
  });

  it("rejects files without .proto extension", () => {
    const target = mapToGeneratedGo({
      workspaceRoot: root,
      moduleRoot,
      protoFile: path.join(moduleRoot, "api", "book", "v1", "book.txt"),
      generatedRoot: "gen/proto-go",
      declaration: declaration("message", "Book")
    });
    assert.equal(target, undefined);
  });
});
