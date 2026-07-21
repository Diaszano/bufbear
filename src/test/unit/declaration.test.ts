import assert from "node:assert/strict";
import { findDeclarationAt } from "../../navigation/go/declaration.js";

describe("findDeclarationAt", () => {
  it("recognizes a message only when the cursor is on its name", () => {
    const text = 'syntax = "proto3";\nmessage CreateBookRequest {\n}\n';
    assert.deepEqual(findDeclarationAt(text, 1, 10), {
      kind: "message",
      name: "CreateBookRequest",
      line: 1,
      startCharacter: 8,
      endCharacter: 25
    });
    assert.equal(findDeclarationAt(text, 1, 2), undefined);
  });

  it("recognizes an enum declaration", () => {
    const text = "enum BookState {\n  BOOK_STATE_UNSPECIFIED = 0;\n}\n";
    assert.equal(findDeclarationAt(text, 0, 7)?.kind, "enum");
    assert.equal(findDeclarationAt(text, 0, 7)?.name, "BookState");
  });

  it("recognizes a service declaration", () => {
    const text = "service BookService {\n}\n";
    assert.equal(findDeclarationAt(text, 0, 10)?.kind, "service");
  });

  it("recognizes an rpc and its containing service", () => {
    const text = [
      "service BookService {",
      "  rpc CreateBook(CreateBookRequest) returns (CreateBookResponse);",
      "}"
    ].join("\n");
    assert.deepEqual(findDeclarationAt(text, 1, 8), {
      kind: "rpc",
      name: "CreateBook",
      line: 1,
      startCharacter: 6,
      endCharacter: 16,
      parentService: "BookService"
    });
  });

  it("ignores declarations inside line comments", () => {
    assert.equal(findDeclarationAt("// message Fake {}", 0, 12), undefined);
  });

  it("ignores declarations inside block comments", () => {
    const text = "/*\nmessage Fake {}\n*/\nmessage Real {}\n";
    assert.equal(findDeclarationAt(text, 1, 10), undefined);
    assert.equal(findDeclarationAt(text, 3, 10)?.name, "Real");
  });

  it("supports leading modifiers and braces on later lines", () => {
    const text = "message MultiLine\n{\n}\n";
    assert.equal(findDeclarationAt(text, 0, 10)?.name, "MultiLine");
  });

  it("does not classify a field type as a declaration", () => {
    const text = "message Container {\n  BookState state = 1;\n}\n";
    assert.equal(findDeclarationAt(text, 1, 4), undefined);
  });
});
