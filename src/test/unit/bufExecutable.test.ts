import assert from "node:assert/strict";
import { probeBuf } from "../../lsp/bufExecutable.js";
import type { ProcessRequest, ProcessResult } from "../../platform/processRunner.js";

describe("probeBuf", () => {
  it("parses trimmed version and detects LSP support when lsp serve succeeds", async () => {
    const calls: ProcessRequest[] = [];
    const mockRunner = (req: ProcessRequest): Promise<ProcessResult> => {
      calls.push(req);
      if (req.args.includes("--version")) {
        return Promise.resolve({ stdout: "1.30.0\n", stderr: "", exitCode: 0, signal: null, timedOut: false });
      }
      if (req.args.includes("lsp") && req.args.includes("serve")) {
        return Promise.resolve({ stdout: "Usage: buf lsp serve...", stderr: "", exitCode: 0, signal: null, timedOut: false });
      }
      return Promise.resolve({ stdout: "", stderr: "", exitCode: 1, signal: null, timedOut: false });
    };

    const result = await probeBuf("buf", mockRunner);

    assert.equal(result.executable, "buf");
    assert.equal(result.version, "1.30.0");
    assert.equal(result.supportsLsp, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.timeoutMs, 5000);
    assert.equal(calls[1]?.timeoutMs, 5000);
  });

  it("returns supportsLsp: false when lsp serve command fails", async () => {
    const mockRunner = (req: ProcessRequest): Promise<ProcessResult> => {
      if (req.args.includes("--version")) {
        return Promise.resolve({ stdout: "1.0.0\n", stderr: "", exitCode: 0, signal: null, timedOut: false });
      }
      return Promise.resolve({ stdout: "unknown command", stderr: "error", exitCode: 1, signal: null, timedOut: false });
    };

    const result = await probeBuf("/usr/local/bin/buf", mockRunner);

    assert.equal(result.executable, "/usr/local/bin/buf");
    assert.equal(result.version, "1.0.0");
    assert.equal(result.supportsLsp, false);
  });

  it("returns supportsLsp: false when lsp serve command times out", async () => {
    const mockRunner = (req: ProcessRequest): Promise<ProcessResult> => {
      if (req.args.includes("--version")) {
        return Promise.resolve({ stdout: "1.25.0\n", stderr: "", exitCode: 0, signal: null, timedOut: false });
      }
      return Promise.resolve({ stdout: "", stderr: "", exitCode: null, signal: "SIGTERM", timedOut: true });
    };

    const result = await probeBuf("buf", mockRunner);

    assert.equal(result.supportsLsp, false);
  });

  it("throws error when version probe fails", async () => {
    const mockRunner = (): Promise<ProcessResult> => {
      return Promise.resolve({ stdout: "", stderr: "command not found", exitCode: 127, signal: null, timedOut: false });
    };

    await assert.rejects(
      () => probeBuf("invalid-buf", mockRunner),
      /Buf version probe failed/
    );
  });

  it("throws error when version probe times out", async () => {
    const mockRunner = (): Promise<ProcessResult> => {
      return Promise.resolve({ stdout: "", stderr: "", exitCode: null, signal: "SIGTERM", timedOut: true });
    };

    await assert.rejects(
      () => probeBuf("buf", mockRunner),
      /Buf version probe failed/
    );
  });

  it("rejects empty or invalid executable strings", async () => {
    const dummyRunner = (): Promise<ProcessResult> => {
      return Promise.resolve({ stdout: "1.0.0", stderr: "", exitCode: 0, signal: null, timedOut: false });
    };

    await assert.rejects(
      () => probeBuf("", dummyRunner),
      /Buf executable must be a non-empty path/
    );
    await assert.rejects(
      () => probeBuf("buf\n", dummyRunner),
      /Buf executable must be a non-empty path/
    );
    await assert.rejects(
      () => probeBuf("buf\0", dummyRunner),
      /Buf executable must be a non-empty path/
    );
  });
});
