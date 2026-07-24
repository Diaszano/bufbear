import assert from "node:assert/strict";
import { runProcess } from "../../platform/processRunner.js";

describe("runProcess", () => {
  it("captures stdout without a shell", async () => {
    const result = await runProcess({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('ok', () => process.exit(0))"],
      timeoutMs: 1000
    });
    assert.equal(result.stdout, "ok");
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
  });

  it("captures stderr and non-zero exit code", async () => {
    const result = await runProcess({
      executable: process.execPath,
      args: ["-e", "process.stderr.write('err', () => process.exit(42))"],
      timeoutMs: 1000
    });
    assert.equal(result.stderr, "err");
    assert.equal(result.exitCode, 42);
    assert.equal(result.timedOut, false);
  });

  it("kills a timed-out process", async () => {
    const result = await runProcess({
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10000)"],
      timeoutMs: 50
    });
    assert.equal(result.timedOut, true);
  });

  it("rejects executables containing control characters", async () => {
    await assert.rejects(
      () =>
        runProcess({
          executable: "node\0bad",
          args: [],
          timeoutMs: 1000
        }),
      /control characters|invalid/i
    );
  });

  it("handles non-existent executable without invoking shell", async () => {
    await assert.rejects(
      () =>
        runProcess({
          executable: "/nonexistent_buf_binary_path_test_12345",
          args: [],
          timeoutMs: 1000
        })
    );
  });

  it("caps stdout buffer at 1 MiB", async () => {
    const result = await runProcess({
      executable: process.execPath,
      args: [
        "-e",
        "process.stdout.write('x'.repeat(1500000), () => process.exit(0))"
      ],
      timeoutMs: 2000
    });
    assert.ok(result.stdout.length <= 1024 * 1024);
  });
});
