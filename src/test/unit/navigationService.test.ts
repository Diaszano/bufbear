import assert from "node:assert/strict";
import path from "node:path";
import {
  GoNavigationService,
  MAX_GENERATED_FILE_BYTES,
  type FileSystem,
  type NavigationRequest
} from "../../navigation/go/navigationService.js";
import type { ProtoDeclaration } from "../../navigation/go/declaration.js";

const root = path.resolve("/workspace");
const moduleRoot = path.join(root, "proto");
const protoFile = path.join(moduleRoot, "api", "book", "v1", "book.proto");
const generatedGoFile = path.join(moduleRoot, "gen", "proto-go", "api", "book", "v1", "book.pb.go");

function createDeclaration(kind: ProtoDeclaration["kind"] = "message", name = "Book"): ProtoDeclaration {
  return {
    kind,
    name,
    line: 0,
    startCharacter: 0,
    endCharacter: name.length
  };
}

function createRequest(overrides?: Partial<NavigationRequest>): NavigationRequest {
  return {
    workspaceRoot: root,
    moduleRoot,
    protoFile,
    generatedRoot: "gen/proto-go",
    declaration: createDeclaration(),
    isCancelled: () => false,
    ...overrides
  };
}

class MockFileSystem implements FileSystem {
  public files = new Map<string, { mtimeMs: number; size: number; content: string }>();
  public statCalls: string[] = [];
  public readCalls: string[] = [];

  public async stat(filePath: string): Promise<{ mtimeMs: number; size: number }> {
    await Promise.resolve();
    this.statCalls.push(filePath);
    const entry = this.files.get(filePath);
    if (!entry) {
      const err = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as Error & { code: string };
      err.code = "ENOENT";
      throw err;
    }
    return { mtimeMs: entry.mtimeMs, size: entry.size };
  }

  public async readFile(filePath: string): Promise<string> {
    await Promise.resolve();
    this.readCalls.push(filePath);
    const entry = this.files.get(filePath);
    if (!entry) {
      const err = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as Error & { code: string };
      err.code = "ENOENT";
      throw err;
    }
    return entry.content;
  }
}

describe("GoNavigationService", () => {
  it("returns undefined for missing file (ENOENT)", async () => {
    const fs = new MockFileSystem();
    const service = new GoNavigationService({ fileSystem: fs });
    const result = await service.find(createRequest());
    assert.equal(result, undefined);
    assert.equal(fs.statCalls.length, 1);
  });

  it("reads and indexes on first request", async () => {
    const fs = new MockFileSystem();
    const content = "package v1\n\ntype Book struct {}\n";
    fs.files.set(generatedGoFile, { mtimeMs: 1000, size: content.length, content });

    const service = new GoNavigationService({ fileSystem: fs });
    const result = await service.find(createRequest());

    assert(result);
    assert.equal(result.filePath, generatedGoFile);
    assert.equal(result.location.line, 2);
    assert.equal(result.location.startCharacter, 5);
    assert.equal(result.location.endCharacter, 9);
    assert.equal(fs.statCalls.length, 1);
    assert.equal(fs.readCalls.length, 1);
  });

  it("reuses cached content when mtime and size are unchanged", async () => {
    const fs = new MockFileSystem();
    const content = "package v1\n\ntype Book struct {}\n";
    fs.files.set(generatedGoFile, { mtimeMs: 1000, size: content.length, content });

    const service = new GoNavigationService({ fileSystem: fs });

    const result1 = await service.find(createRequest());
    assert(result1);

    const result2 = await service.find(createRequest());
    assert(result2);

    assert.equal(fs.statCalls.length, 2);
    assert.equal(fs.readCalls.length, 1);
  });

  it("invalidates cache when mtime changes", async () => {
    const fs = new MockFileSystem();
    const content1 = "package v1\n\ntype Book struct {}\n";
    fs.files.set(generatedGoFile, { mtimeMs: 1000, size: content1.length, content: content1 });

    const service = new GoNavigationService({ fileSystem: fs });
    await service.find(createRequest());
    assert.equal(fs.readCalls.length, 1);

    const content2 = "// updated\npackage v1\n\ntype Book struct {}\n";
    fs.files.set(generatedGoFile, { mtimeMs: 2000, size: content2.length, content: content2 });

    const result = await service.find(createRequest());
    assert(result);
    assert.equal(result.location.line, 3);
    assert.equal(fs.statCalls.length, 2);
    assert.equal(fs.readCalls.length, 2);
  });

  it("explicit invalidate(filePath) forces reread", async () => {
    const fs = new MockFileSystem();
    const content = "package v1\n\ntype Book struct {}\n";
    fs.files.set(generatedGoFile, { mtimeMs: 1000, size: content.length, content });

    const service = new GoNavigationService({ fileSystem: fs });
    await service.find(createRequest());
    assert.equal(fs.readCalls.length, 1);

    service.invalidate(generatedGoFile);

    await service.find(createRequest());
    assert.equal(fs.readCalls.length, 2);
  });

  it("explicit invalidate() without path clears entire cache", async () => {
    const fs = new MockFileSystem();
    const content = "package v1\n\ntype Book struct {}\n";
    fs.files.set(generatedGoFile, { mtimeMs: 1000, size: content.length, content });

    const service = new GoNavigationService({ fileSystem: fs });
    await service.find(createRequest());
    assert.equal(fs.readCalls.length, 1);

    service.invalidate();

    await service.find(createRequest());
    assert.equal(fs.readCalls.length, 2);
  });

  it("returns undefined when cancelled before stat", async () => {
    const fs = new MockFileSystem();
    const content = "package v1\n\ntype Book struct {}\n";
    fs.files.set(generatedGoFile, { mtimeMs: 1000, size: content.length, content });

    const service = new GoNavigationService({ fileSystem: fs });
    const result = await service.find(createRequest({ isCancelled: () => true }));

    assert.equal(result, undefined);
    assert.equal(fs.statCalls.length, 0);
    assert.equal(fs.readCalls.length, 0);
  });

  it("returns undefined when cancelled after stat", async () => {
    const fs = new MockFileSystem();
    const content = "package v1\n\ntype Book struct {}\n";
    fs.files.set(generatedGoFile, { mtimeMs: 1000, size: content.length, content });

    let callCount = 0;
    const isCancelled = () => {
      callCount++;
      return callCount > 1; // false before stat, true after stat
    };

    const service = new GoNavigationService({ fileSystem: fs });
    const result = await service.find(createRequest({ isCancelled }));

    assert.equal(result, undefined);
    assert.equal(fs.statCalls.length, 1);
    assert.equal(fs.readCalls.length, 0);
  });

  it("returns undefined when cancelled after read", async () => {
    const fs = new MockFileSystem();
    const content = "package v1\n\ntype Book struct {}\n";
    fs.files.set(generatedGoFile, { mtimeMs: 1000, size: content.length, content });

    let callCount = 0;
    const isCancelled = () => {
      callCount++;
      return callCount > 2; // false before stat and after stat, true after read
    };

    const service = new GoNavigationService({ fileSystem: fs });
    const result = await service.find(createRequest({ isCancelled }));

    assert.equal(result, undefined);
    assert.equal(fs.statCalls.length, 1);
    assert.equal(fs.readCalls.length, 1);
  });

  it("rejects files larger than MAX_GENERATED_FILE_BYTES and invokes callback", async () => {
    const fs = new MockFileSystem();
    const largeSize = MAX_GENERATED_FILE_BYTES + 1;
    fs.files.set(generatedGoFile, { mtimeMs: 1000, size: largeSize, content: "large" });

    let tooLargePath: string | undefined;
    let tooLargeSize: number | undefined;

    const service = new GoNavigationService({
      fileSystem: fs,
      onFileTooLarge: (filePath, size) => {
        tooLargePath = filePath;
        tooLargeSize = size;
      }
    });

    const result = await service.find(createRequest());
    assert.equal(result, undefined);
    assert.equal(fs.statCalls.length, 1);
    assert.equal(fs.readCalls.length, 0);
    assert.equal(tooLargePath, generatedGoFile);
    assert.equal(tooLargeSize, largeSize);
  });

  it("never calls filesystem when path mapping fails", async () => {
    const fs = new MockFileSystem();
    const service = new GoNavigationService({ fileSystem: fs });

    // Proto file outside module root
    const result = await service.find(
      createRequest({ protoFile: path.resolve("/outside/other.proto") })
    );

    assert.equal(result, undefined);
    assert.equal(fs.statCalls.length, 0);
    assert.equal(fs.readCalls.length, 0);
  });

  it("rethrows unexpected filesystem errors", async () => {
    const fs = {
      async stat() {
        await Promise.resolve();
        const err = new Error("Permission denied") as Error & { code: string };
        err.code = "EACCES";
        throw err;
      },
      async readFile() {
        await Promise.resolve();
        return "";
      }
    };

    const service = new GoNavigationService({ fileSystem: fs });
    await assert.rejects(async () => {
      await service.find(createRequest());
    }, (err: Error & { code?: string }) => err.code === "EACCES");
  });
});
