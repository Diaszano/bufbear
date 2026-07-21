import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { findBufRoot, invalidateRootCache } from "../../lsp/rootDiscovery.js";

describe("rootDiscovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    invalidateRootCache();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bufbear-test-"));
  });

  afterEach(async () => {
    invalidateRootCache();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("finds nearest marker when buf.yaml is present", async () => {
    const rootDir = path.join(tempDir, "workspace");
    const subDir = path.join(rootDir, "sub");
    const deepDir = path.join(subDir, "deep");
    await fs.mkdir(deepDir, { recursive: true });

    await fs.writeFile(path.join(subDir, "buf.yaml"), "version: v1\n");
    const protoFile = path.join(deepDir, "service.proto");
    await fs.writeFile(protoFile, "syntax = \"proto3\";");

    const found = await findBufRoot(protoFile, rootDir);
    assert.equal(found, subDir);
  });

  it("nearest marker wins when nested buf.yaml exists", async () => {
    const rootDir = path.join(tempDir, "workspace");
    const subDir = path.join(rootDir, "sub");
    await fs.mkdir(subDir, { recursive: true });

    await fs.writeFile(path.join(rootDir, "buf.yaml"), "version: v1\n");
    await fs.writeFile(path.join(subDir, "buf.yaml"), "version: v1\n");
    const protoFile = path.join(subDir, "service.proto");
    await fs.writeFile(protoFile, "syntax = \"proto3\";");

    const found = await findBufRoot(protoFile, rootDir);
    assert.equal(found, subDir);
  });

  it("stops search at workspace boundary and returns workspace boundary for orphan", async () => {
    const rootDir = path.join(tempDir, "workspace");
    const parentDir = tempDir;
    const subDir = path.join(rootDir, "sub");
    await fs.mkdir(subDir, { recursive: true });

    // Write buf.yaml outside the workspace boundary
    await fs.writeFile(path.join(parentDir, "buf.yaml"), "version: v1\n");
    const protoFile = path.join(subDir, "orphan.proto");
    await fs.writeFile(protoFile, "syntax = \"proto3\";");

    const found = await findBufRoot(protoFile, rootDir);
    assert.equal(found, rootDir);
  });

  it("returns undefined when no boundary and no marker exists", async () => {
    const subDir = path.join(tempDir, "noboundary", "sub");
    await fs.mkdir(subDir, { recursive: true });
    const protoFile = path.join(subDir, "test.proto");
    await fs.writeFile(protoFile, "syntax = \"proto3\";");

    const found = await findBufRoot(protoFile);
    assert.equal(found, undefined);
  });

  it("caches root discovery results per starting directory and invalidates properly", async () => {
    const subDir = path.join(tempDir, "cachetest", "sub");
    await fs.mkdir(subDir, { recursive: true });
    const protoFile = path.join(subDir, "test.proto");
    await fs.writeFile(protoFile, "syntax = \"proto3\";");

    // Initial query - no marker
    const first = await findBufRoot(protoFile, tempDir);
    assert.equal(first, tempDir);

    // Now create buf.yaml in subDir
    await fs.writeFile(path.join(subDir, "buf.yaml"), "version: v1\n");

    // Cached result returned
    const cached = await findBufRoot(protoFile, tempDir);
    assert.equal(cached, tempDir);

    // Invalidate single directory or all
    invalidateRootCache(subDir);
    const fresh = await findBufRoot(protoFile, tempDir);
    assert.equal(fresh, subDir);
  });
});
