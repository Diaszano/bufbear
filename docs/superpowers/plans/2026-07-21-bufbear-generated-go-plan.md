# BufBear Generated Go Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cancellation-aware Go to Implementation from Protobuf `message`, `enum`, `service`, and `rpc` declarations to exact symbols in source-relative generated Go files.

**Architecture:** A narrow, pure declaration recognizer identifies only supported declarations at the cursor. Pure mapping logic converts a Protobuf file and declaration into a generated Go target, and a bounded file index locates exact Go anchors. A thin VS Code provider adapts documents, positions, configuration, trust, filesystem watchers, and locations.

**Tech Stack:** TypeScript 7, VS Code API 1.125+, Node.js filesystem APIs, Mocha, existing BufBear platform primitives.

## Global Constraints

- This plan starts after the foundation plan is complete.
- Project root: `~/Documents/GitHub/bufbear`.
- Extension ID: `diaszano.bufbear`.
- Configuration namespace: `bufBear`.
- User-facing command prefix: `BufBear:`.
- Supported declarations: `message`, `enum`, `service`, and `rpc`.
- v1 supports generated Go only.
- Default generated root: `gen/proto-go`.
- Mapping assumes source-relative generation.
- Do not scan the entire workspace.
- Do not parse complete Protobuf semantics.
- Do not use a regex built from an unescaped user-controlled symbol.
- Generated roots must remain inside the workspace after normalization.
- All provider operations honor `CancellationToken`.
- Missing files and anchors are normal no-result cases.
- Pure modules must not import `vscode`.
- Use TDD and one English Conventional Commit per task.

---

## Target file structure

```text
src/navigation/go/
├── declaration.ts
├── fileMapping.ts
├── goIndex.ts
├── implementationProvider.ts
└── navigationService.ts

src/test/unit/
├── declaration.test.ts
├── fileMapping.test.ts
├── goIndex.test.ts
└── navigationService.test.ts

src/test/fixtures/generated-go/
├── buf.yaml
├── api/example/v1/example.proto
└── gen/proto-go/api/example/v1/
    ├── example.pb.go
    └── example_grpc.pb.go
```

---

### Task 1: Recognize supported Protobuf declarations

**Files:**
- Create: `src/navigation/go/declaration.ts`
- Create: `src/test/unit/declaration.test.ts`

**Interfaces:**
- Produces:

```ts
export type ProtoDeclarationKind = "message" | "enum" | "service" | "rpc";

export interface ProtoDeclaration {
  readonly kind: ProtoDeclarationKind;
  readonly name: string;
  readonly line: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
  readonly parentService?: string;
}

export function findDeclarationAt(
  text: string,
  line: number,
  character: number
): ProtoDeclaration | undefined;
```

- [ ] **Step 1: Write declaration tests**

```ts
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
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npm run compile-tests
npx mocha "out/test/unit/declaration.test.js"
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement comment masking**

Create a same-length masked string that replaces comment characters with spaces while retaining `\n`. Support:

- `//` through end of line;
- `/* ... */` across lines;
- quoted strings so comment markers inside strings are not treated as comments.

The scanner state is:

```ts
type ScanState = "code" | "line-comment" | "block-comment" | "string";
```

Do not attempt to parse Protobuf syntax beyond comment/string masking.

- [ ] **Step 4: Implement declaration extraction**

Use anchored line expressions with static patterns:

```ts
const TOP_LEVEL = /^\s*(message|enum|service)\s+([A-Za-z_][A-Za-z0-9_]*)\b/u;
const RPC = /^\s*rpc\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u;
```

Track the nearest enclosing service using brace depth over the masked document. Return only when `character` is within `[startCharacter, endCharacter]`.

For rpc declarations, set `parentService`; if an enclosing service cannot be determined, return no declaration.

- [ ] **Step 5: Run tests**

```bash
npm run verify
```

Expected: declaration tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/navigation/go/declaration.ts src/test/unit/declaration.test.ts
git commit -m "feat: recognize protobuf declarations for implementation navigation"
```

---

### Task 2: Map Protobuf files to generated Go targets safely

**Files:**
- Create: `src/navigation/go/fileMapping.ts`
- Create: `src/test/unit/fileMapping.test.ts`

**Interfaces:**
- Consumes: `ProtoDeclaration`.
- Produces:

```ts
export interface GoMappingInput {
  readonly workspaceRoot: string;
  readonly moduleRoot: string;
  readonly protoFile: string;
  readonly generatedRoot: string;
  readonly declaration: ProtoDeclaration;
}

export interface GoTarget {
  readonly filePath: string;
  readonly symbolName: string;
  readonly kind: ProtoDeclarationKind;
  readonly parentService?: string;
}

export function mapToGeneratedGo(input: GoMappingInput): GoTarget | undefined;
```

- [ ] **Step 1: Write mapping tests**

```ts
import assert from "node:assert/strict";
import path from "node:path";
import { mapToGeneratedGo } from "../../navigation/go/fileMapping.js";
import type { ProtoDeclaration } from "../../navigation/go/declaration.js";

const root = path.resolve("/workspace");
const moduleRoot = path.join(root, "proto");
const protoFile = path.join(moduleRoot, "api", "book", "v1", "book.proto");

function declaration(kind: ProtoDeclaration["kind"], name: string): ProtoDeclaration {
  return {
    kind,
    name,
    line: 0,
    startCharacter: 0,
    endCharacter: name.length,
    ...(kind === "rpc" ? { parentService: "BookService" } : {})
  };
}

describe("mapToGeneratedGo", () => {
  it("maps message to .pb.go", () => {
    const target = mapToGeneratedGo({
      workspaceRoot: root,
      moduleRoot,
      protoFile,
      generatedRoot: "gen/proto-go",
      declaration: declaration("message", "Book")
    });
    assert.equal(
      target?.filePath,
      path.join(moduleRoot, "gen", "proto-go", "api", "book", "v1", "book.pb.go")
    );
  });

  it("maps enum to .pb.go", () => {
    const target = mapToGeneratedGo({
      workspaceRoot: root,
      moduleRoot,
      protoFile,
      generatedRoot: "gen/proto-go",
      declaration: declaration("enum", "BookState")
    });
    assert.match(target?.filePath ?? "", /book\.pb\.go$/u);
  });

  it("maps service and rpc to _grpc.pb.go", () => {
    for (const kind of ["service", "rpc"] as const) {
      const target = mapToGeneratedGo({
        workspaceRoot: root,
        moduleRoot,
        protoFile,
        generatedRoot: "gen/proto-go",
        declaration: declaration(kind, kind === "service" ? "BookService" : "CreateBook")
      });
      assert.match(target?.filePath ?? "", /book_grpc\.pb\.go$/u);
    }
  });

  it("rejects generated roots that escape the workspace", () => {
    const target = mapToGeneratedGo({
      workspaceRoot: root,
      moduleRoot,
      protoFile,
      generatedRoot: "../../outside",
      declaration: declaration("message", "Book")
    });
    assert.equal(target, undefined);
  });

  it("rejects proto files outside the module root", () => {
    const target = mapToGeneratedGo({
      workspaceRoot: root,
      moduleRoot,
      protoFile: path.resolve("/other/book.proto"),
      generatedRoot: "gen/proto-go",
      declaration: declaration("message", "Book")
    });
    assert.equal(target, undefined);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm run compile-tests
npx mocha "out/test/unit/fileMapping.test.js"
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement safe path containment**

Create:

```ts
function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
```

On Windows, compare normalized drive/case behavior through `path.resolve` and `path.relative`; tests must also include path-separator-independent assertions.

- [ ] **Step 4: Implement file mapping**

Algorithm:

1. require `moduleRoot` inside `workspaceRoot`;
2. require `protoFile` inside `moduleRoot`;
3. resolve `generatedRoot` relative to `moduleRoot`;
4. require resolved generated root inside `workspaceRoot`;
5. compute source-relative directory from `moduleRoot`;
6. replace `.proto` with `.pb.go` or `_grpc.pb.go`;
7. return the exact symbol metadata.

Never derive paths from `go_package`.

- [ ] **Step 5: Verify**

```bash
npm run verify
```

- [ ] **Step 6: Commit**

```bash
git add src/navigation/go/fileMapping.ts src/test/unit/fileMapping.test.ts
git commit -m "feat: map protobuf declarations to generated go files"
```

---

### Task 3: Build an exact generated Go symbol index

**Files:**
- Create: `src/navigation/go/goIndex.ts`
- Create: `src/test/unit/goIndex.test.ts`

**Interfaces:**
- Produces:

```ts
export interface IndexedLocation {
  readonly line: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
}

export interface GoIndex {
  find(
    content: string,
    target: GoTarget,
    isCancelled?: () => boolean
  ): IndexedLocation | undefined;
}

export function createGoIndex(): GoIndex;
```

- [ ] **Step 1: Create realistic test fixtures**

Use generated-style content:

```go
type Book struct {
  state protoimpl.MessageState
}

type BookState int32

type BookServiceServer interface {
  CreateBook(context.Context, *CreateBookRequest) (*CreateBookResponse, error)
  mustEmbedUnimplementedBookServiceServer()
}

func (UnimplementedBookServiceServer) CreateBook(context.Context, *CreateBookRequest) (*CreateBookResponse, error) {
  return nil, status.Errorf(codes.Unimplemented, "method CreateBook not implemented")
}
```

- [ ] **Step 2: Write exact-match tests**

Cover:

- message `type Book struct`;
- enum `type BookState int32`;
- service `type BookServiceServer interface`;
- rpc method inside the correct service interface;
- similarly named symbols such as `BookArchive` do not match `Book`;
- rpc implementation method outside the interface is not preferred;
- cancellation before and during scanning returns undefined;
- CRLF and LF input.

- [ ] **Step 3: Implement token-safe matching**

Escape symbol names:

```ts
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
```

Static anchor patterns:

```ts
message: /^\s*type\s+NAME\s+struct\b/u
enum: /^\s*type\s+NAME\s+int32\b/u
service: /^\s*type\s+NAMEServer\s+interface\s*\{/u
```

For rpc:

1. locate the exact `<Parent>Server interface {`;
2. track braces until the interface closes;
3. inside that range, match `^\s*<RpcName>\s*\(`;
4. return the method-name token.

Check cancellation every 128 lines.

- [ ] **Step 4: Return exact token positions**

Calculate the token start with `line.indexOf(symbolToken)` only after the complete static regex matched. Never use substring matching alone.

- [ ] **Step 5: Verify**

```bash
npm run verify
```

- [ ] **Step 6: Commit**

```bash
git add src/navigation/go/goIndex.ts src/test/unit/goIndex.test.ts
git commit -m "feat: index exact symbols in generated go files"
```

---

### Task 4: Add cached filesystem navigation service

**Files:**
- Create: `src/navigation/go/navigationService.ts`
- Create: `src/test/unit/navigationService.test.ts`

**Interfaces:**
- Consumes: root discovery, file mapping, Go index, `BoundedCache`.
- Produces:

```ts
export interface NavigationRequest {
  readonly workspaceRoot: string;
  readonly moduleRoot: string;
  readonly protoFile: string;
  readonly generatedRoot: string;
  readonly declaration: ProtoDeclaration;
  readonly isCancelled: () => boolean;
}

export interface NavigationResult {
  readonly filePath: string;
  readonly location: IndexedLocation;
}

export class GoNavigationService {
  find(request: NavigationRequest): Promise<NavigationResult | undefined>;
  invalidate(filePath?: string): void;
}
```

- [ ] **Step 1: Define the cache record**

```ts
interface CachedFile {
  readonly mtimeMs: number;
  readonly size: number;
  readonly content: string;
}
```

Use `BoundedCache<string, CachedFile>(256)`.

- [ ] **Step 2: Write service tests with injected filesystem**

Inject:

```ts
interface FileSystem {
  stat(filePath: string): Promise<{ mtimeMs: number; size: number }>;
  readFile(filePath: string): Promise<string>;
}
```

Test:

- missing file returns undefined;
- first request reads and indexes;
- unchanged mtime/size reuses content;
- changed mtime invalidates;
- explicit `invalidate(path)` forces reread;
- cancellation before stat, after stat, and after read returns undefined;
- files larger than 5 MiB are scanned in chunks or rejected with a documented no-result;
- path mapping failure never calls the filesystem.

- [ ] **Step 3: Implement the service**

Default filesystem adapter:

```ts
const fileSystem: FileSystem = {
  async stat(filePath) {
    const value = await fs.stat(filePath);
    return { mtimeMs: value.mtimeMs, size: value.size };
  },
  async readFile(filePath) {
    return fs.readFile(filePath, "utf8");
  }
};
```

Treat `ENOENT` and `ENOTDIR` as no-result. Rethrow unexpected errors to the provider boundary so they can be logged once.

- [ ] **Step 4: Add size safety**

For v1, set `MAX_GENERATED_FILE_BYTES = 5 * 1024 * 1024`.

Return no result for larger files and log through a callback supplied by the VS Code adapter. This prevents extension-host stalls. Do not silently allocate unbounded content.

- [ ] **Step 5: Verify**

```bash
npm run verify
```

- [ ] **Step 6: Commit**

```bash
git add src/navigation/go/navigationService.ts src/test/unit/navigationService.test.ts
git commit -m "feat: add cached generated go navigation service"
```

---

### Task 5: Implement the VS Code implementation provider

**Files:**
- Create: `src/navigation/go/implementationProvider.ts`
- Modify: `src/extension.ts`
- Modify: `src/ui/commands.ts`
- Modify: `src/config/types.ts`
- Modify: `src/config/config.ts`

**Interfaces:**
- Consumes: `findDeclarationAt`, `findBufRoot`, `GoNavigationService`, resource configuration, workspace trust.
- Produces: `vscode.ImplementationProvider` and the explicit navigation command.

- [ ] **Step 1: Implement provider dependencies**

```ts
export interface ImplementationProviderDependencies {
  readonly navigation: GoNavigationService;
  readonly output: Output;
}
```

- [ ] **Step 2: Implement `provideImplementation` flow**

```ts
public async provideImplementation(
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken
): Promise<vscode.Location | undefined> {
  if (!vscode.workspace.isTrusted || token.isCancellationRequested) {
    return undefined;
  }

  const config = readConfig(document.uri);
  if (!config.goEnabled || !config.goSourceRelative) {
    return undefined;
  }

  const declaration = findDeclarationAt(
    document.getText(),
    position.line,
    position.character
  );
  if (!declaration || token.isCancellationRequested) {
    return undefined;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return undefined;
  }

  const moduleRoot = await findBufRoot(
    document.uri.fsPath,
    workspaceFolder.uri.fsPath
  );
  if (!moduleRoot || token.isCancellationRequested) {
    return undefined;
  }

  const result = await this.dependencies.navigation.find({
    workspaceRoot: workspaceFolder.uri.fsPath,
    moduleRoot,
    protoFile: document.uri.fsPath,
    generatedRoot: config.goGenRoot,
    declaration,
    isCancelled: () => token.isCancellationRequested
  });

  if (!result || token.isCancellationRequested) {
    return undefined;
  }

  const positionResult = new vscode.Position(
    result.location.line,
    result.location.startCharacter
  );
  return new vscode.Location(vscode.Uri.file(result.filePath), positionResult);
}
```

Catch unexpected errors, log workspace-relative details, and return undefined. The provider must not show notifications.

- [ ] **Step 3: Register the provider**

In activation:

```ts
context.subscriptions.push(
  vscode.languages.registerImplementationProvider(
    { language: "proto3", scheme: "file" },
    new GeneratedGoImplementationProvider({ navigation, output })
  )
);
```

- [ ] **Step 4: Implement explicit command behavior**

`bufBear.goToGeneratedImplementation` executes the same resolution for the active editor. Unlike the provider, it may show:

- `Place the cursor on a message, enum, service, or rpc declaration.`
- `No Buf module root was found.`
- `Generated Go file or symbol was not found. Run code generation or check bufBear.go.genRoot.`

Open the target with:

```ts
const document = await vscode.workspace.openTextDocument(location.uri);
await vscode.window.showTextDocument(document, {
  selection: new vscode.Range(location.range.start, location.range.start),
  preview: true
});
```

Do not duplicate mapping logic; call a shared resolver method.

- [ ] **Step 5: Verify type and unit tests**

```bash
npm run verify
```

- [ ] **Step 6: Commit**

```bash
git add src/navigation/go/implementationProvider.ts src/extension.ts src/ui/commands.ts src/config
git commit -m "feat: add generated go implementation provider"
```

---

### Task 6: Add filesystem invalidation and integration fixtures

**Files:**
- Create: `src/test/fixtures/generated-go/buf.yaml`
- Create: `src/test/fixtures/generated-go/api/example/v1/example.proto`
- Create: `src/test/fixtures/generated-go/gen/proto-go/api/example/v1/example.pb.go`
- Create: `src/test/fixtures/generated-go/gen/proto-go/api/example/v1/example_grpc.pb.go`
- Create: `src/test/integration/suite/generatedGo.test.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Produces: cache invalidation on generated Go changes and Extension Host coverage for all supported declaration kinds.

- [ ] **Step 1: Create the Protobuf fixture**

```proto
syntax = "proto3";

package example.v1;

message Book {
  string id = 1;
}

enum BookState {
  BOOK_STATE_UNSPECIFIED = 0;
}

service BookService {
  rpc CreateBook(CreateBookRequest) returns (CreateBookResponse);
}

message CreateBookRequest {}
message CreateBookResponse {}
```

- [ ] **Step 2: Create minimal generated Go fixtures**

Files need only valid text anchors; they do not need to compile as Go.

`example.pb.go`:

```go
package examplev1

type Book struct {
}

type BookState int32

const (
  BookState_BOOK_STATE_UNSPECIFIED BookState = 0
)

type CreateBookRequest struct {
}

type CreateBookResponse struct {
}
```

`example_grpc.pb.go`:

```go
package examplev1

type BookServiceServer interface {
  CreateBook(context.Context, *CreateBookRequest) (*CreateBookResponse, error)
  mustEmbedUnimplementedBookServiceServer()
}
```

- [ ] **Step 3: Add generated-file watchers**

Create watchers per workspace root:

```ts
new vscode.RelativePattern(root, `${normalizedGenRoot}/**/*.{pb.go,grpc.pb.go}`)
```

On create/change/delete, call `navigation.invalidate(uri.fsPath)`. Dispose watchers with the extension context.

Because glob interpolation has platform and special-character concerns, normalize separators to `/` and escape VS Code glob metacharacters in configured roots. If the root cannot be represented safely, use a broad `**/*.pb.go` watcher and filter normalized paths in the callback.

- [ ] **Step 4: Write integration tests**

For each declaration:

1. open the fixture `.proto`;
2. locate the declaration name;
3. call `vscode.executeImplementationProvider`;
4. assert one result;
5. assert target file suffix;
6. assert target line contains exact expected anchor.

Also test:

- cursor on a field returns no implementation;
- `bufBear.go.enabled = false` returns none;
- bad `go.genRoot` returns none;
- editing a generated fixture then firing/save causes a new location to be observed after invalidation.

- [ ] **Step 5: Verify**

```bash
npm run verify
npm run test:integration
```

Expected: all declaration kinds navigate to exact fixture anchors.

- [ ] **Step 6: Commit**

```bash
git add src/test/fixtures src/test/integration src/extension.ts
git commit -m "test: cover generated go implementation navigation"
```

---

### Task 7: Add performance and security regression tests

**Files:**
- Create: `src/test/unit/navigationSecurity.test.ts`
- Create: `src/test/unit/navigationPerformance.test.ts`
- Modify: `src/navigation/go/declaration.ts`
- Modify: `src/navigation/go/navigationService.ts`

**Interfaces:**
- Produces: enforceable budgets and regression coverage.

- [ ] **Step 1: Add path-security cases**

Test:

- `generatedRoot = "../outside"`;
- absolute generated root outside workspace;
- mixed separators;
- symlink escape when realpath checks are available;
- NUL in configuration;
- workspace and module roots on different drives on Windows.

For symlinks, resolve `realpath` for existing roots before final containment checks. If generated root does not exist, validate lexical containment and repeat realpath validation when the file exists.

- [ ] **Step 2: Add adversarial symbol cases**

Test symbols and nearby content that could trigger regex mistakes:

- `Book`;
- `Book2`;
- `Book_Archive`;
- `BookServiceServerFactory`;
- `CreateBookWithAudit`;
- comments containing exact anchors;
- string literals containing exact anchors.

The Go index must ignore anchors inside `//` and `/* */` comments.

- [ ] **Step 3: Add performance tests**

Generate:

- a 10,000-line `.proto` string with one target declaration;
- a 50,000-line generated Go string below 5 MiB;
- 1,000 repeated cached lookups.

Use generous CI-safe thresholds:

```ts
assert.ok(declarationDurationMs < 100);
assert.ok(firstGoIndexDurationMs < 250);
assert.ok(cachedDurationMs < 50);
```

Performance tests must fail only on clear regressions, not normal CI variance.

- [ ] **Step 4: Add cancellation stress**

Cancel after 128, 256, and 512 scanned lines and assert no location is returned. Ensure no cache entry is committed for a cancelled incomplete read/index.

- [ ] **Step 5: Verify**

```bash
npm run verify
```

- [ ] **Step 6: Commit**

```bash
git add src/navigation/go src/test/unit
git commit -m "test: harden generated navigation security and performance"
```

---

### Task 8: Document, package, and release v0.1.0

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/generated-go-navigation.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: documented generated Go behavior and a release-ready VSIX.

- [ ] **Step 1: Document generated Go assumptions**

`docs/generated-go-navigation.md` must state:

- only source-relative generated Go is supported;
- default root is `gen/proto-go`;
- file mappings for message/enum/service/rpc;
- exact supported anchors;
- how to change `bufBear.go.genRoot`;
- why `go_package` is not used for filesystem mapping;
- missing generated files return no result;
- current 5 MiB generated-file limit;
- troubleshooting checklist.

- [ ] **Step 2: Update README feature and settings sections**

Add a concise example:

```text
api/book/v1/book.proto
gen/proto-go/api/book/v1/book.pb.go
gen/proto-go/api/book/v1/book_grpc.pb.go
```

Explain that **Go to Definition** is supplied by Buf LSP and **Go to Implementation** into generated Go is supplied by BufBear.

- [ ] **Step 3: Update CHANGELOG**

Add:

```markdown
- Added Go to Implementation for Protobuf messages, enums, services, and RPCs.
- Added source-relative generated Go mapping with configurable root.
- Added bounded indexing cache, cancellation, filesystem invalidation, and path traversal protection.
```

- [ ] **Step 4: Extend CI**

Run integration tests on Ubuntu and unit/package verification on all three operating systems. Keep generated fixtures local and do not require a real Buf executable for generated-navigation tests.

- [ ] **Step 5: Execute the release verification matrix**

```bash
npm ci
npm run verify
npm run test:integration
npm run package:vsix
npx vsce ls
git status --short
```

Expected:

- all commands succeed;
- VSIX includes docs and generated-navigation provider;
- repository is clean after packaging except the intentionally untracked VSIX, if `.gitignore` does not already exclude it.

- [ ] **Step 6: Manual validation**

Validate on real generated Go:

- message;
- enum;
- service;
- rpc;
- nested directory;
- custom generated root;
- generated file missing;
- stale generated file;
- multi-root workspace;
- cancellation by invoking another navigation quickly.

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md docs .github
git commit -m "docs: document generated go navigation"
```

- [ ] **Step 8: Tag after review**

```bash
git tag -a v0.1.0 -m "BufBear v0.1.0"
git push origin main
git push origin v0.1.0
```

Do not tag until CI is green and the VSIX has been installed and manually opened in a clean VS Code profile.

---

## Plan self-review

- Every generated-navigation requirement from the specification maps to a task.
- There is no workspace-wide scan.
- The declaration recognizer is deliberately narrow and is not used for semantic language features.
- File mapping is source-relative and rejects workspace escapes.
- Go symbol matching is exact, comment-aware, cancellation-aware, and bounded.
- Cache size, invalidation, file size, and performance budgets are explicit.
- Provider no-result behavior is silent; the explicit command provides actionable messages.
- The plan contains no dependency on private repositories or organization-specific paths.
