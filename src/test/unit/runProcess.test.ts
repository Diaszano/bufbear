import assert from "node:assert/strict";
import { runProcess } from "../../platform/runProcess.js";

describe("runProcess (platform)", () => {
  it("captures stdout and stderr on successful execution", async () => {
    const result = await runProcess(
      process.execPath,
      ["-e", "process.stdout.write('out'); process.stderr.write('err')"],
      { timeoutMs: 2000 }
    );
    assert.equal(result.stdout, "out");
    assert.equal(result.stderr, "err");
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
  });

  it("handles process timeout correctly", async () => {
    const result = await runProcess(
      process.execPath,
      ["-e", "setTimeout(() => {}, 10000)"],
      { timeoutMs: 50 }
    );
    assert.equal(result.timedOut, true);
  });

  it("enforces 10 MiB buffer cap and rejects when exceeded", async () => {
    await assert.rejects(
      () =>
        runProcess(
          process.execPath,
          ["-e", "process.stdout.write(Buffer.alloc(11 * 1024 * 1024))"],
          { timeoutMs: 5000 }
        ),
      /Process output buffer limit exceeded/
    );
  });

  it("rejects executables containing invalid control characters", async () => {
    await assert.rejects(
      () =>
        runProcess("node\0bad", [], { timeoutMs: 1000 }),
      /control characters/i
    );
  });

  it("rejects when binary path does not exist", async () => {
    await assert.rejects(
      () =>
        runProcess("/nonexistent_buf_binary_test_12345", [], { timeoutMs: 1000 })
    );
  });
});
