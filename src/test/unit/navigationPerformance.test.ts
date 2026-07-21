import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { findDeclarationAt } from "../../navigation/go/declaration.js";
import { createGoIndex } from "../../navigation/go/goIndex.js";
import { GoNavigationService, type FileSystem } from "../../navigation/go/navigationService.js";

describe("Navigation Performance & Cancellation", () => {
  it("parses declaration in a 10,000-line .proto file in under 100ms", () => {
    const protoLines: string[] = ['syntax = "proto3";', "package perf;"];
    for (let i = 2; i < 9998; i++) {
      protoLines.push(`// Line comment ${String(i)} with extra text to simulate realistic file length`);
    }
    protoLines.push("message TargetMessage {");
    protoLines.push("}");

    const protoContent = protoLines.join("\n");
    const targetLine = 9998;

    const start = performance.now();
    const decl = findDeclarationAt(protoContent, targetLine, 10);
    const durationMs = performance.now() - start;

    assert.ok(decl);
    assert.equal(decl.name, "TargetMessage");
    assert.ok(
      durationMs < 100,
      `10,000-line proto declaration parsing took ${durationMs.toFixed(2)}ms (budget: < 100ms)`
    );
  });

  it("indexes a 50,000-line Go file (< 5 MiB) in under 250ms and responds to 1,000 cached lookups in under 50ms", async () => {
    const goLines: string[] = ["package gen", ""];
    for (let i = 2; i < 49998; i++) {
      goLines.push(`// Go line comment ${String(i)} for performance testing`);
    }
    goLines.push("type TargetMessage struct {");
    goLines.push("  Id string");
    goLines.push("}");

    const goContent = goLines.join("\n");
    const contentSizeBytes = Buffer.byteLength(goContent, "utf8");
    assert.ok(contentSizeBytes < 5 * 1024 * 1024, "Generated Go content exceeds 5 MiB threshold");

    let readCount = 0;
    const mockFs: FileSystem = {
      async stat() {
        await Promise.resolve();
        return { mtimeMs: 1000, size: contentSizeBytes };
      },
      async readFile() {
        await Promise.resolve();
        readCount++;
        return goContent;
      }
    };

    const service = new GoNavigationService({ fileSystem: mockFs });
    const request = {
      workspaceRoot: "/workspace/project",
      moduleRoot: "/workspace/project",
      protoFile: "/workspace/project/perf.proto",
      generatedRoot: "gen",
      declaration: {
        kind: "message" as const,
        name: "TargetMessage",
        line: 9998,
        startCharacter: 8,
        endCharacter: 21
      },
      isCancelled: () => false
    };

    // First uncached lookup
    const firstStart = performance.now();
    const firstResult = await service.find(request);
    const firstDurationMs = performance.now() - firstStart;

    assert.ok(firstResult);
    assert.equal(firstResult.location.line, 49998);
    assert.equal(readCount, 1);
    assert.ok(
      firstDurationMs < 250,
      `Uncached 50,000-line Go indexing took ${firstDurationMs.toFixed(2)}ms (budget: < 250ms)`
    );

    // 1,000 repeated cached lookups
    const cachedStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      const result = await service.find(request);
      assert.ok(result);
    }
    const cachedDurationMs = performance.now() - cachedStart;

    assert.equal(readCount, 1, "Cached lookups must not re-read from filesystem");
    assert.ok(
      cachedDurationMs < 50,
      `1,000 cached lookups took ${cachedDurationMs.toFixed(2)}ms (budget: < 50ms)`
    );
  });

  it("handles cancellation stress after 128, 256, and 512 scanned lines without committing cache", async () => {
    const goLines: string[] = ["package gen", ""];
    for (let i = 2; i < 2000; i++) {
      goLines.push(`// Line ${String(i)}`);
    }
    goLines.push("type StressMessage struct {}");

    const goContent = goLines.join("\n");
    let readCount = 0;

    const mockFs: FileSystem = {
      async stat() {
        await Promise.resolve();
        return { mtimeMs: 2000, size: Buffer.byteLength(goContent, "utf8") };
      },
      async readFile() {
        await Promise.resolve();
        readCount++;
        return goContent;
      }
    };

    const targetDeclaration = {
      kind: "message" as const,
      name: "StressMessage",
      line: 1999,
      startCharacter: 8,
      endCharacter: 21
    };

    // Check cancellation after 128, 256, 512 scanned lines in goIndex (checked every 128 lines: i=0, 128, 256, 384, 512)
    const checkThresholds = [
      2, // Cancel at 2nd check (line index 128)
      3, // Cancel at 3rd check (line index 256)
      5  // Cancel at 5th check (line index 512)
    ];

    for (const cancelAtCheck of checkThresholds) {
      const service = new GoNavigationService({ fileSystem: mockFs });
      let checks = 0;

      const request = {
        workspaceRoot: "/workspace/project",
        moduleRoot: "/workspace/project",
        protoFile: "/workspace/project/stress.proto",
        generatedRoot: "gen",
        declaration: targetDeclaration,
        isCancelled: () => {
          checks++;
          return checks >= cancelAtCheck;
        }
      };

      const result = await service.find(request);
      assert.equal(result, undefined, `Expected undefined result when cancelled at check ${String(cancelAtCheck)}`);

      // Now issue a non-cancelled request with a fresh service instance or verify readCount incremented
      // If cache was NOT committed, a subsequent non-cancelled request to the SAME service will be forced to read again (readCount increments).
      const initialReads = readCount;
      const validRequest = { ...request, isCancelled: () => false };
      const validResult = await service.find(validRequest);

      assert.ok(validResult);
      assert.equal(readCount, initialReads + 1, "Cache should not have been committed during cancelled request");
    }
  });

  it("directly tests goIndex cancellation after 128, 256, 512 scanned lines", () => {
    const index = createGoIndex();
    const goLines: string[] = ["package gen", ""];
    for (let i = 2; i < 2000; i++) {
      goLines.push(`// Line ${String(i)}`);
    }
    goLines.push("type StressMessage struct {}");
    const goContent = goLines.join("\n");

    const target = {
      filePath: "/ws/gen/stress.pb.go",
      symbolName: "StressMessage",
      kind: "message" as const
    };

    // Test cancelling on checks 2 (line 128), 3 (line 256), 5 (line 512)
    for (const cancelAtCheck of [2, 3, 5]) {
      let checks = 0;
      const isCancelled = () => {
        checks++;
        return checks >= cancelAtCheck;
      };

      const result = index.find(goContent, target, isCancelled);
      assert.equal(result, undefined);
    }
  });
});
