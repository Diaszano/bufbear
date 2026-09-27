import assert from "node:assert/strict";
import { diffLines, type LineEdit } from "../../formatting/textDiff.js";

function splitLines(text: string): string[] {
  return text.split("\n");
}

function applyEdits(originalLines: readonly string[], edits: readonly LineEdit[]): string[] {
  const lines = [...originalLines];
  for (let index = edits.length - 1; index >= 0; index--) {
    const edit = edits[index];
    if (!edit) {
      continue;
    }
    const replacement = edit.newText === "" ? [] : edit.newText.split("\n");
    lines.splice(edit.startLine, edit.endLineExclusive - edit.startLine, ...replacement);
  }
  return lines;
}

describe("diffLines", () => {
  it("returns no edits for identical inputs", () => {
    const lines = ['syntax = "proto3";', "", "message Foo {}"];
    assert.deepEqual(diffLines(lines, lines), []);
  });

  it("replaces a single changed line in the middle", () => {
    const original = splitLines("a\nbad  line\nb");
    const formatted = splitLines("a\nbad line\nb");
    const edits = diffLines(original, formatted);

    assert.equal(edits.length, 1);
    const singleEdit = edits[0];
    assert.ok(singleEdit);
    assert.deepEqual(singleEdit, { startLine: 1, endLineExclusive: 2, newText: "bad line" });
    assert.deepEqual(applyEdits(original, edits), formatted);
  });

  it("groups a multiline replaced block into a single LineEdit", () => {
    const original = splitLines("message Foo {\n  a=1;\n  b=2;\n  c=3;\n}");
    const formatted = splitLines("message Foo {\n  a = 1;\n  b = 2;\n  c = 3;\n}");
    const edits = diffLines(original, formatted);

    assert.equal(edits.length, 1);
    const blockEdit = edits[0];
    assert.ok(blockEdit);
    assert.equal(blockEdit.startLine, 1);
    assert.equal(blockEdit.endLineExclusive, 4);
    assert.equal(blockEdit.newText, "  a = 1;\n  b = 2;\n  c = 3;");
    assert.deepEqual(applyEdits(original, edits), formatted);
  });

  it("covers lines added in the middle", () => {
    const original = splitLines("a\nb");
    const formatted = splitLines("a\nx\ny\nb");
    const edits = diffLines(original, formatted);

    assert.equal(edits.length, 1);
    assert.deepEqual(edits[0], { startLine: 0, endLineExclusive: 1, newText: "a\nx\ny" });
    assert.deepEqual(applyEdits(original, edits), formatted);
  });

  it("removes deleted lines with an empty replacement", () => {
    const original = splitLines("a\nx\ny\nb");
    const formatted = splitLines("a\nb");
    const edits = diffLines(original, formatted);

    assert.equal(edits.length, 1);
    assert.deepEqual(edits[0], { startLine: 1, endLineExclusive: 3, newText: "" });
    assert.deepEqual(applyEdits(original, edits), formatted);
  });

  it("emits a single full-document edit for a complete reformatting", () => {
    const original = splitLines('syntax="proto3";\nmessage Foo{');
    const formatted = splitLines('syntax = "proto3";\nmessage Foo {');
    const edits = diffLines(original, formatted);

    assert.equal(edits.length, 1);
    assert.deepEqual(edits[0], {
      startLine: 0,
      endLineExclusive: 2,
      newText: 'syntax = "proto3";\nmessage Foo {',
    });
    assert.deepEqual(applyEdits(original, edits), formatted);
  });

  it("covers everything as an insertion when the original is empty", () => {
    const edits = diffLines([], ["a", "b"]);

    assert.deepEqual(edits, [{ startLine: 0, endLineExclusive: 0, newText: "a\nb" }]);
  });

  it("removes everything when the result is empty", () => {
    const edits = diffLines(["a", "b"], []);

    assert.deepEqual(edits, [{ startLine: 0, endLineExclusive: 2, newText: "" }]);
  });
});
