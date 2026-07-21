import assert from "node:assert/strict";
import { formatProtoText, type FormatInput } from "../../formatting/bufFormatter.js";

describe("bufFormatter", () => {
  it("formats valid proto text via stdin successfully", async () => {
    const fakeRunProcess = (
      _executable: string,
      args: readonly string[],
      options?: { cwd?: string; stdin?: string }
    ) => {
      assert.deepEqual(args, ["format", "-"]);
      assert.equal(options?.stdin, "syntax=\"proto3\";\nmessage Book{string name=1;}");
      return Promise.resolve({
        exitCode: 0,
        stdout: "syntax = \"proto3\";\n\nmessage Book {\n  string name = 1;\n}\n",
        stderr: ""
      });
    };

    const input: FormatInput = {
      text: "syntax=\"proto3\";\nmessage Book{string name=1;}",
      bufPath: "buf",
      cwd: "/workspace/root",
      runProcess: fakeRunProcess
    };

    const result = await formatProtoText(input);
    if (!result.success) {
      assert.fail("expected formatProtoText to succeed");
    }
    assert.equal(
      result.formattedText,
      "syntax = \"proto3\";\n\nmessage Book {\n  string name = 1;\n}\n"
    );
  });

  it("returns error result when buf returns non-zero exit code on syntax error", async () => {
    const fakeRunProcess = () =>
      Promise.resolve({
        exitCode: 1,
        stdout: "",
        stderr: "syntax error: expected field name"
      });

    const input: FormatInput = {
      text: "invalid proto content",
      bufPath: "buf",
      cwd: "/workspace/root",
      runProcess: fakeRunProcess
    };

    const result = await formatProtoText(input);
    if (result.success) {
      assert.fail("expected formatProtoText to fail");
    }
    assert.ok(result.error.includes("syntax error"));
  });

  it("catches process execution errors gracefully", async () => {
    const fakeRunProcess = () => Promise.reject(new Error("buf executable not found"));

    const input: FormatInput = {
      text: "syntax = \"proto3\";",
      bufPath: "nonexistent-buf",
      cwd: "/workspace/root",
      runProcess: fakeRunProcess
    };

    const result = await formatProtoText(input);
    if (result.success) {
      assert.fail("expected formatProtoText to fail");
    }
    assert.equal(result.error, "buf executable not found");
  });

  it("returns clear timeout error message when process times out", async () => {
    const fakeRunProcess = () =>
      Promise.resolve({
        exitCode: null,
        stdout: "",
        stderr: "",
        timedOut: true
      });

    const input: FormatInput = {
      text: "syntax = \"proto3\";",
      bufPath: "buf",
      cwd: "/workspace/root",
      timeoutMs: 3000,
      runProcess: fakeRunProcess
    };

    const result = await formatProtoText(input);
    if (result.success) {
      assert.fail("expected formatProtoText to fail");
    }
    assert.equal(result.error, "Formatting timed out after 3000ms");
  });
});
