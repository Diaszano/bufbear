import assert from "node:assert/strict";
import path from "node:path";
import { findDeclarationAt } from "../../navigation/go/declaration.js";
import { mapToGeneratedGo } from "../../navigation/go/fileMapping.js";
import { createGoIndex } from "../../navigation/go/goIndex.js";
import { GoNavigationService, type FileSystem } from "../../navigation/go/navigationService.js";

describe("Navigation Security", () => {
  describe("Path Traversal and Safety", () => {
    const baseDeclaration = {
      kind: "message" as const,
      name: "Book",
      line: 0,
      startCharacter: 8,
      endCharacter: 12
    };

    it("rejects generatedRoot = '../outside' that escapes workspace", () => {
      const result = mapToGeneratedGo({
        workspaceRoot: "/workspace/project",
        moduleRoot: "/workspace/project/module",
        protoFile: "/workspace/project/module/book.proto",
        generatedRoot: "../../outside",
        declaration: baseDeclaration
      });
      assert.equal(result, undefined);
    });

    it("rejects absolute generated root outside workspace", () => {
      const result = mapToGeneratedGo({
        workspaceRoot: "/workspace/project",
        moduleRoot: "/workspace/project/module",
        protoFile: "/workspace/project/module/book.proto",
        generatedRoot: "/outside/gen",
        declaration: baseDeclaration
      });
      assert.equal(result, undefined);
    });

    it("handles mixed separators safely", () => {
      const result = mapToGeneratedGo({
        workspaceRoot: "/workspace/project",
        moduleRoot: "/workspace/project/module",
        protoFile: "/workspace/project/module/sub/book.proto",
        generatedRoot: "gen/go",
        declaration: baseDeclaration
      });
      assert.ok(result);
      assert.equal(
        result.filePath,
        path.resolve("/workspace/project/module/gen/go/sub/book.pb.go")
      );
    });

    it("rejects NUL bytes in workspaceRoot, moduleRoot, protoFile, or generatedRoot", () => {
      const nullInputs = [
        { workspaceRoot: "/workspace\0/project" },
        { moduleRoot: "/workspace/project\0/module" },
        { protoFile: "/workspace/project/module/book.proto\0" },
        { generatedRoot: "gen\0/go" }
      ];

      for (const override of nullInputs) {
        const result = mapToGeneratedGo({
          workspaceRoot: "/workspace/project",
          moduleRoot: "/workspace/project/module",
          protoFile: "/workspace/project/module/book.proto",
          generatedRoot: "gen/go",
          declaration: baseDeclaration,
          ...override
        });
        assert.equal(result, undefined);
      }
    });

    it("rejects workspace and module roots on different drives on Windows", () => {
      const result = mapToGeneratedGo({
        workspaceRoot: "C:\\workspace\\project",
        moduleRoot: "D:\\workspace\\project\\module",
        protoFile: "D:\\workspace\\project\\module\\book.proto",
        generatedRoot: "gen\\go",
        declaration: baseDeclaration
      });
      assert.equal(result, undefined);
    });

    it("rejects symlink escape when realpath resolves outside workspace", async () => {
      const mockFs: FileSystem = {
        async stat(_filePath: string) {
          await Promise.resolve();
          return { mtimeMs: 100, size: 50 };
        },
        async readFile(_filePath: string) {
          await Promise.resolve();
          return "package gen\n\ntype Book struct{}\n";
        },
        async realpath(filePath: string) {
          await Promise.resolve();
          if (filePath === "/workspace/project") {
            return "/workspace/project";
          }
          return "/outside/book.pb.go";
        }
      };

      const service = new GoNavigationService({ fileSystem: mockFs });
      const result = await service.find({
        workspaceRoot: "/workspace/project",
        moduleRoot: "/workspace/project",
        protoFile: "/workspace/project/book.proto",
        generatedRoot: "gen",
        declaration: baseDeclaration,
        isCancelled: () => false
      });

      assert.equal(result, undefined);
    });
  });

  describe("Adversarial Symbol Names & Comment/String Isolation", () => {
    const index = createGoIndex();

    it("matches exact target symbol 'Book' and ignores 'Book2' and 'Book_Archive'", () => {
      const content = [
        "package gen",
        "",
        "type Book2 struct {}",
        "type Book_Archive struct {}",
        "type Book struct {}"
      ].join("\n");

      const result = index.find(content, {
        filePath: "/ws/gen/book.pb.go",
        symbolName: "Book",
        kind: "message"
      });

      assert.ok(result);
      assert.equal(result.line, 4);
      assert.equal(result.startCharacter, 5);
      assert.equal(result.endCharacter, 9);
    });

    it("matches exact target service 'BookService' and ignores 'BookServiceServerFactory'", () => {
      const content = [
        "package gen",
        "",
        "type BookServiceServerFactory interface {}",
        "type BookServiceServer interface {}"
      ].join("\n");

      const result = index.find(content, {
        filePath: "/ws/gen/book_grpc.pb.go",
        symbolName: "BookService",
        kind: "service"
      });

      assert.ok(result);
      assert.equal(result.line, 3);
    });

    it("matches exact target rpc 'CreateBook' and ignores 'CreateBookWithAudit'", () => {
      const content = [
        "package gen",
        "",
        "type BookServiceServer interface {",
        "  CreateBookWithAudit(ctx Context, req *Req) (*Res, error)",
        "  CreateBook(ctx Context, req *Req) (*Res, error)",
        "}"
      ].join("\n");

      const result = index.find(content, {
        filePath: "/ws/gen/book_grpc.pb.go",
        symbolName: "CreateBook",
        kind: "rpc",
        parentService: "BookService"
      });

      assert.ok(result);
      assert.equal(result.line, 4);
      assert.equal(result.startCharacter, 2);
      assert.equal(result.endCharacter, 12);
    });

    it("ignores declarations in line comments", () => {
      const content = [
        "package gen",
        "",
        "// type Book struct {}",
        "type Book struct {}"
      ].join("\n");

      const result = index.find(content, {
        filePath: "/ws/gen/book.pb.go",
        symbolName: "Book",
        kind: "message"
      });

      assert.ok(result);
      assert.equal(result.line, 3);
    });

    it("ignores declarations in block comments", () => {
      const content = [
        "package gen",
        "",
        "/*",
        "type Book struct {}",
        "*/",
        "type Book struct {}"
      ].join("\n");

      const result = index.find(content, {
        filePath: "/ws/gen/book.pb.go",
        symbolName: "Book",
        kind: "message"
      });

      assert.ok(result);
      assert.equal(result.line, 5);
    });

    it("ignores declarations inside string literals and raw backtick strings", () => {
      const content = [
        "package gen",
        "",
        'var s1 = "type Book struct {}"',
        'var s2 = `type Book struct {}`',
        "type Book struct {}"
      ].join("\n");

      const result = index.find(content, {
        filePath: "/ws/gen/book.pb.go",
        symbolName: "Book",
        kind: "message"
      });

      assert.ok(result);
      assert.equal(result.line, 4);
    });

    it("ignores comments and strings in findDeclarationAt proto parser", () => {
      const protoText = [
        'syntax = "proto3";',
        '// message Book {}',
        '/* message Book {} */',
        'option string_opt = "message Book {}";',
        'message Book {}'
      ].join("\n");

      assert.equal(findDeclarationAt(protoText, 1, 10), undefined);
      assert.equal(findDeclarationAt(protoText, 2, 10), undefined);
      assert.equal(findDeclarationAt(protoText, 3, 24), undefined);

      const decl = findDeclarationAt(protoText, 4, 10);
      assert.ok(decl);
      assert.equal(decl.name, "Book");
      assert.equal(decl.line, 4);
    });
  });
});
