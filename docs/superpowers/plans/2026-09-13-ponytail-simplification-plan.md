# Ponytail Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate over-engineering, dead code, speculative abstractions, duplicate implementations, and bloated DI bags across BufBear as identified in the repo-wide ponytail audit.

**Architecture:** Progressively streamline the codebase by eliminating duplicate process runners, unifying comment masking, pruning single-implementation interfaces and factories, replacing hand-rolled utilities with standard VS Code / Node APIs, consolidating repeated `getVscode` polyfills, and stripping unnecessary LCS diff complexity.

**Tech Stack:** TypeScript 5.7+, Node 24+, VS Code Extension API (`vscode`), Mocha, `vscode-languageclient/node`.

**Spec:** [docs/superpowers/specs/2026-07-21-bufbear-spec.md](file:///home/diaszano/Documentos/GitHub/bufbear/docs/superpowers/specs/2026-07-21-bufbear-spec.md)

## Global Constraints

- Preserve all extension capabilities: Protobuf language client, Go navigation, document formatting, linter code actions, status bar, and conflict warnings.
- Keep all unit tests passing (`npm test`) and type checking clean (`npm run check-types`).
- Follow Conventional Commits (`refactor:`, `chore:`, etc.) for every task.
- Zero external runtime dependencies added (maintain `dependencies: { "vscode-languageclient": "^10.1.0" }`).

---

### Task 1: Remove Unused `_directory` Parameter in Root Invalidation (Audit Point 19)

**Files:**
- Modify: `src/lsp/rootDiscovery.ts:7-9`
- Modify: `src/test/unit/rootDiscovery.test.ts:75-85`

**Interfaces:**
- Consumes: None
- Produces: `export function invalidateRootCache(): void`

- [ ] **Step 1: Update unit test to call `invalidateRootCache()` with 0 arguments**

In `src/test/unit/rootDiscovery.test.ts`, ensure all calls to `invalidateRootCache` pass no arguments:
```typescript
invalidateRootCache();
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `npm run compile-tests && mocha out/test/unit/rootDiscovery.test.js`
Expected: PASS

- [ ] **Step 3: Remove unused `_directory` parameter from `invalidateRootCache`**

In `src/lsp/rootDiscovery.ts`:
```typescript
export function invalidateRootCache(): void {
  rootCache.clear();
}
```

- [ ] **Step 4: Verify types and tests pass**

Run: `npm run check-types && npm run test:unit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lsp/rootDiscovery.ts src/test/unit/rootDiscovery.test.ts
git commit -m "refactor(lsp): remove unused directory parameter from invalidateRootCache"
```

---

### Task 2: Inline `restartDecision.ts` into `extension.ts` (Audit Point 14)

**Files:**
- Delete: `src/config/restartDecision.ts`
- Delete: `src/test/unit/restartDecision.test.ts`
- Modify: `src/extension.ts:14,100-106`

**Interfaces:**
- Consumes: `vscode.ConfigurationChangeEvent`
- Produces: Inline setting check inside `extension.ts`

- [ ] **Step 1: Inline `LSP_RESTART_SETTINGS` and the check in `src/extension.ts`**

In `src/extension.ts`, remove import of `shouldRestartLsp` and define the settings directly:
```typescript
const LSP_RESTART_SETTINGS = [
  "bufBear.buf.path",
  "bufBear.lsp.enabled",
  "bufBear.buf.trace.server"
] as const;
```
And inside `context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => ...))`:
```typescript
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (LSP_RESTART_SETTINGS.some((setting) => e.affectsConfiguration(setting))) {
        const activeDoc = vscode.window.activeTextEditor?.document;
        void manager.restartForResource(activeDoc?.uri, "configuration changed");
        statusBar.update();
      }
    })
  );
```

- [ ] **Step 2: Delete `src/config/restartDecision.ts` and `src/test/unit/restartDecision.test.ts`**

```bash
rm src/config/restartDecision.ts src/test/unit/restartDecision.test.ts
```

- [ ] **Step 3: Run typecheck and tests**

Run: `npm run check-types && npm run test:unit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts src/config/restartDecision.ts src/test/unit/restartDecision.test.ts
git commit -m "refactor(config): inline lsp restart decision into extension"
```

---

### Task 3: Consolidate Child-Process Runner into `platform/runProcess.ts` (Audit Point 2)

**Files:**
- Delete: `src/platform/processRunner.ts`
- Delete: `src/test/unit/processRunner.test.ts`
- Modify: `src/lsp/bufExecutable.ts:1-35`
- Modify: `src/test/unit/bufExecutable.test.ts:1-60`

**Interfaces:**
- Consumes: `runProcess(executable, args, options)` from `src/platform/runProcess.ts`
- Produces: `probeBuf(executable, runner)` using `runProcess`

- [ ] **Step 1: Update `bufExecutable.ts` to use `runProcess` from `src/platform/runProcess.ts`**

In `src/lsp/bufExecutable.ts`:
```typescript
import { runProcess, type RunProcessResult } from "../platform/runProcess.js";

export interface BufProbe {
  readonly executable: string;
  readonly version: string;
  readonly supportsLsp: boolean;
}

type Runner = (
  executable: string,
  args: readonly string[],
  options?: { timeoutMs?: number }
) => Promise<RunProcessResult>;

export async function probeBuf(
  executable: string,
  runner: Runner = runProcess
): Promise<BufProbe> {
  if (executable.length === 0 || /[\0\r\n]/u.test(executable)) {
    throw new Error("Buf executable must be a non-empty path or command name");
  }

  const version = await runner(executable, ["--version"], { timeoutMs: 5000 });
  if (version.exitCode !== 0 || version.timedOut) {
    throw new Error("Buf version probe failed");
  }

  const lsp = await runner(executable, ["lsp", "serve", "--help"], { timeoutMs: 5000 });

  return {
    executable,
    version: version.stdout.trim(),
    supportsLsp: lsp.exitCode === 0 && !lsp.timedOut
  };
}
```

- [ ] **Step 2: Update `src/test/unit/bufExecutable.test.ts` runner mocks**

Update `src/test/unit/bufExecutable.test.ts` mock runners to match `(executable, args, options) => Promise<RunProcessResult>`.

- [ ] **Step 3: Delete `src/platform/processRunner.ts` and `src/test/unit/processRunner.test.ts`**

```bash
rm src/platform/processRunner.ts src/test/unit/processRunner.test.ts
```

- [ ] **Step 4: Run typecheck and tests**

Run: `npm run check-types && npm run test:unit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lsp/bufExecutable.ts src/test/unit/bufExecutable.test.ts src/platform/processRunner.ts src/test/unit/processRunner.test.ts
git commit -m "refactor(platform): consolidate process runners into runProcess"
```

---

### Task 4: Deduplicate Comment/String Masking (Audit Point 3)

**Files:**
- Modify: `src/navigation/go/declaration.ts:14-77`
- Modify: `src/navigation/go/goIndex.ts:36-103`

**Interfaces:**
- Consumes: `maskComments` from `src/navigation/go/declaration.js`
- Produces: `prepareGoLines(content: string)` reusing `maskComments`

- [ ] **Step 1: Import `maskComments` in `src/navigation/go/goIndex.ts` and delete duplicate `maskCommentsAndStrings`**

In `src/navigation/go/goIndex.ts`:
```typescript
import { maskComments } from "./declaration.js";
```
Replace `prepareGoLines`:
```typescript
export function prepareGoLines(content: string): string[] {
  return maskComments(content).split(/\r?\n/u);
}
```
Delete `maskCommentsAndStrings` (lines 40-103) completely.

- [ ] **Step 2: Run test suite to verify GoIndex tests still pass**

Run: `npm run compile-tests && mocha out/test/unit/goIndex.test.js out/test/unit/declaration.test.js`
Expected: PASS

- [ ] **Step 3: Verify full unit tests**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/navigation/go/goIndex.ts
git commit -m "refactor(navigation): deduplicate comment and string masking helper"
```

---

### Task 5: Simplify Redundant Drive-Letter Regex Normalization (Audit Point 11)

**Files:**
- Modify: `src/navigation/go/fileMapping.ts:27-54`
- Test: `src/test/unit/fileMapping.test.ts`

**Interfaces:**
- Consumes: `isWithin(parent: string, candidate: string): boolean`
- Produces: Cleaned up `isWithin` without duplicate pre-resolve drive regex checks

- [ ] **Step 1: Inspect and simplify `isWithin` in `src/navigation/go/fileMapping.ts`**

Simplify lines 27-54:
```typescript
export function isWithin(parent: string, candidate: string): boolean {
  if (hasNul(parent) || hasNul(candidate)) {
    return false;
  }

  const normParent = path.resolve(parent);
  const normCandidate = path.resolve(candidate);

  const parentDrive = /^[a-zA-Z]:/u.exec(normParent)?.[0]?.toUpperCase();
  const candidateDrive = /^[a-zA-Z]:/u.exec(normCandidate)?.[0]?.toUpperCase();
  if (parentDrive !== candidateDrive) {
    return false;
  }

  const relative = path.relative(normParent, normCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
```

- [ ] **Step 2: Run unit and security tests for fileMapping**

Run: `npm run compile-tests && mocha out/test/unit/fileMapping.test.js out/test/unit/navigationSecurity.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/navigation/go/fileMapping.ts
git commit -m "refactor(navigation): simplify drive normalization in isWithin"
```

---

### Task 6: Simplify `GoIndex` Interface and Factory (Audit Point 10)

**Files:**
- Modify: `src/navigation/go/goIndex.ts`
- Modify: `src/navigation/go/navigationService.ts:5-10,34-38,71-79`
- Modify: `src/test/unit/goIndex.test.ts`
- Modify: `src/test/unit/navigationService.test.ts`

**Interfaces:**
- Consumes: None
- Produces: Exported `findInGoLines` function and direct `GoIndex` class (or direct function) without redundant factory `createGoIndex`

- [ ] **Step 1: Simplify `GoIndex` exports**

Export `GoIndex` class directly with `find` and `findInLines` methods, removing the single-product `createGoIndex` factory:
```typescript
export class GoIndex {
  public find(content: string, target: GoTarget, isCancelled?: () => boolean): IndexedLocation | undefined {
    return this.findInLines(prepareGoLines(content), target, isCancelled);
  }
  public findInLines(lines: readonly string[], target: GoTarget, isCancelled?: () => boolean): IndexedLocation | undefined {
    // search logic...
  }
}
```

- [ ] **Step 2: Update callers in `src/navigation/go/navigationService.ts` and test files**

Change `options.goIndex ?? createGoIndex()` to `options.goIndex ?? new GoIndex()`.
Update `src/test/unit/goIndex.test.ts` to instantiate `new GoIndex()`.

- [ ] **Step 3: Run unit tests**

Run: `npm run check-types && npm run test:unit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/navigation/go/goIndex.ts src/navigation/go/navigationService.ts src/test/unit/goIndex.test.ts src/test/unit/navigationService.test.ts
git commit -m "refactor(navigation): simplify GoIndex class and remove createGoIndex factory"
```

---

### Task 7: Remove `FileSystem` Abstraction Wrapper in `navigationService.ts` (Audit Point 9)

**Files:**
- Modify: `src/navigation/go/navigationService.ts:28-38,48-59,70-79,98-126,153-161`
- Modify: `src/test/unit/navigationService.test.ts`

**Interfaces:**
- Consumes: `node:fs/promises`
- Produces: `GoNavigationService` calling `fs.stat`, `fs.readFile`, `fs.realpath` directly, with optional filesystem overrides kept minimal for testing

- [ ] **Step 1: Simplify `FileSystem` in `src/navigation/go/navigationService.ts`**

Make `FileSystem` optional test hooks or call `node:fs/promises` directly by default without the extra wrapper indirection:
```typescript
export interface FileSystemReader {
  stat?: typeof fs.stat;
  readFile?: typeof fs.readFile;
  realpath?: typeof fs.realpath;
}
```
Use `fs.stat`, `fs.readFile`, `fs.realpath` directly in `#stat`, `#readFile`, `#realpath`.

- [ ] **Step 2: Run unit and performance tests**

Run: `npm run compile-tests && mocha out/test/unit/navigationService.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/navigation/go/navigationService.ts src/test/unit/navigationService.test.ts
git commit -m "refactor(navigation): simplify filesystem calls in GoNavigationService"
```

---

### Task 8: Remove Fallback Class Polyfills in `implementationProvider.ts` (Audit Point 8)

**Files:**
- Modify: `src/navigation/go/implementationProvider.ts:121-150`
- Modify: `src/test/unit/implementationProvider.test.ts`

**Interfaces:**
- Consumes: `vscode`
- Produces: `provideImplementation` returning `vscode.Location` directly using `vsc.Location` and `vsc.Position`

- [ ] **Step 1: Replace inline 24-line fallback class polyfills with direct VS Code construction**

In `src/navigation/go/implementationProvider.ts`, lines 121-150:
```typescript
      const vsc = getVscode();
      if (!vsc) {
        return undefined;
      }

      return new vsc.Location(
        vsc.Uri.file(resolution.result.filePath),
        new vsc.Position(resolution.result.location.line, resolution.result.location.startCharacter)
      );
```

- [ ] **Step 2: Update unit tests in `implementationProvider.test.ts` to supply mock `vscode` if not already present**

Ensure mock `vsc` passed in unit tests implements `Location`, `Position`, `Uri.file`.

- [ ] **Step 3: Run unit tests**

Run: `npm run compile-tests && mocha out/test/unit/implementationProvider.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/navigation/go/implementationProvider.ts src/test/unit/implementationProvider.test.ts
git commit -m "refactor(navigation): eliminate fallback class polyfills in implementation provider"
```

---

### Task 9: Consolidate `getVscode()` Try-Require Helpers (Audit Point 5)

**Files:**
- Create: `src/platform/vscodeRef.ts`
- Modify: `src/config/config.ts:4-11`
- Modify: `src/formatting/formatProvider.ts:8-15`
- Modify: `src/navigation/go/implementationProvider.ts:8-15`
- Modify: `src/ui/codeActions.ts:3-10`
- Modify: `src/ui/commands.ts:12-19`
- Modify: `src/ui/conflictDetector.ts:5-12`
- Modify: `src/ui/statusBar.ts:8-15`

**Interfaces:**
- Consumes: `require("vscode")`
- Produces: `export function getVscode(): typeof vscode | undefined`

- [ ] **Step 1: Create `src/platform/vscodeRef.ts`**

```typescript
import type * as vscode from "vscode";

export function getVscode(): typeof vscode | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("vscode") as typeof vscode;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 2: Replace local `getVscode()` definitions across the 7 files with the import**

Import `{ getVscode } from "../platform/vscodeRef.js"` and remove the duplicate function from all 7 files.

- [ ] **Step 3: Run type check and unit tests**

Run: `npm run check-types && npm run test:unit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/platform/vscodeRef.ts src/config/config.ts src/formatting/formatProvider.ts src/navigation/go/implementationProvider.ts src/ui/codeActions.ts src/ui/commands.ts src/ui/conflictDetector.ts src/ui/statusBar.ts
git commit -m "refactor(platform): centralize getVscode helper into shared platform module"
```

---

### Task 10: Replace `SimpleEventEmitter` with `vscode.EventEmitter` (Audit Point 6)

**Files:**
- Modify: `src/lsp/clientManager.ts:33-66,102`
- Modify: `src/test/unit/clientManager.test.ts`

**Interfaces:**
- Consumes: `vscode.EventEmitter`
- Produces: `DefaultClientManager` using standard `vscode.EventEmitter`

- [ ] **Step 1: Replace `SimpleEventEmitter` with `vscode.EventEmitter`**

In `src/lsp/clientManager.ts`, import `getVscode` from `../platform/vscodeRef.js`.
If running in VS Code, instantiate `new (getVscode()!.EventEmitter)<readonly RootServerStatus[]>()`.
For non-VS Code environments (bare unit tests without mock vscode), provide a 5-line minimal fallback or inject `EventEmitter`.
Delete the 34-line `SimpleEventEmitter` class.

- [ ] **Step 2: Run unit tests**

Run: `npm run compile-tests && mocha out/test/unit/clientManager.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lsp/clientManager.ts src/test/unit/clientManager.test.ts
git commit -m "refactor(lsp): use vscode.EventEmitter instead of custom SimpleEventEmitter"
```

---

### Task 11: Simplify `RestartPolicy` (Audit Point 7)

**Files:**
- Modify: `src/lsp/restartPolicy.ts`
- Modify: `src/test/unit/restartPolicy.test.ts`

**Interfaces:**
- Consumes: Timestamps
- Produces: Compact `recordFailure(now?: number): number | undefined` and `reset(): void`

- [ ] **Step 1: Simplify `RestartPolicy` in `src/lsp/restartPolicy.ts`**

```typescript
const DEFAULT_DELAYS = [0, 1000, 3000, 10000] as const;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

export class RestartPolicy {
  private failures: number[] = [];

  public constructor(
    private readonly windowMs: number = DEFAULT_WINDOW_MS,
    private readonly delays: readonly number[] = DEFAULT_DELAYS
  ) {}

  public recordFailure(now: number = Date.now()): number | undefined {
    this.failures = this.failures.filter((t) => now - t < this.windowMs);
    this.failures.push(now);
    return this.delays[this.failures.length - 1];
  }

  public reset(): void {
    this.failures.length = 0;
  }
}
```

- [ ] **Step 2: Run unit tests**

Run: `npm run compile-tests && mocha out/test/unit/restartPolicy.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lsp/restartPolicy.ts src/test/unit/restartPolicy.test.ts
git commit -m "refactor(lsp): simplify RestartPolicy implementation"
```

---

### Task 12: Remove `createClientManager` Factory and Single-Impl Interface (Audit Point 12)

**Files:**
- Modify: `src/lsp/clientManager.ts:13-20,98,520-523`
- Modify: `src/test/unit/clientManager.test.ts`

**Interfaces:**
- Consumes: `ClientManagerDependencies`
- Produces: `export class ClientManager` directly (formerly `DefaultClientManager`), remove unused `createClientManager`

- [ ] **Step 1: Rename `DefaultClientManager` to `ClientManager` directly and remove factory function**

In `src/lsp/clientManager.ts`:
- Delete the redundant `interface ClientManager`.
- Rename `class DefaultClientManager implements ClientManager` to `export class ClientManager`.
- Remove `export function createClientManager(...)`.

- [ ] **Step 2: Update `src/extension.ts` and `src/test/unit/clientManager.test.ts`**

Change `new DefaultClientManager(...)` / `createClientManager(...)` to `new ClientManager(...)`.

- [ ] **Step 3: Run unit tests**

Run: `npm run check-types && npm run test:unit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lsp/clientManager.ts src/extension.ts src/test/unit/clientManager.test.ts
git commit -m "refactor(lsp): consolidate ClientManager interface and implementation"
```

---

### Task 13: Use `vscode.Disposable.from` in `commands.ts` (Audit Point 17)

**Files:**
- Modify: `src/ui/commands.ts:357-364`

**Interfaces:**
- Consumes: `disposables: vscode.Disposable[]`
- Produces: Return `vscode.Disposable.from(...disposables)`

- [ ] **Step 1: Replace manual dispose loop with `vscode.Disposable.from`**

In `src/ui/commands.ts`:
```typescript
  if (vsc?.Disposable?.from) {
    return vsc.Disposable.from(...disposables);
  }
  return {
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    }
  };
```

- [ ] **Step 2: Run unit tests**

Run: `npm run compile-tests && mocha out/test/unit/commands.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/commands.ts
git commit -m "refactor(ui): use vscode.Disposable.from for command disposables"
```

---

### Task 14: Simplify `WorkspaceWatcherApi` in `workspaceWatchers.ts` (Audit Point 18)

**Files:**
- Modify: `src/ui/workspaceWatchers.ts:7-22`
- Modify: `src/extension.ts:24`
- Modify: `src/test/unit/workspaceWatchers.test.ts`

**Interfaces:**
- Consumes: `vscode`
- Produces: `registerWorkspaceWatchers(context, navigation, options)` without manual `WorkspaceWatcherApi` object wrapping

- [ ] **Step 1: Simplify `registerWorkspaceWatchers` signature and defaults**

In `src/ui/workspaceWatchers.ts`:
Remove `WorkspaceWatcherApi` interface. Default `api` to `getVscode()!`.
In `src/extension.ts`, simplify call:
```typescript
registerWorkspaceWatchers(context, navigation);
```

- [ ] **Step 2: Run unit tests**

Run: `npm run check-types && npm run test:unit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/workspaceWatchers.ts src/extension.ts src/test/unit/workspaceWatchers.test.ts
git commit -m "refactor(ui): simplify workspace watcher dependency API"
```

---

### Task 15: Simplify `ConflictDetectorDependencies` in `conflictDetector.ts` (Audit Point 13)

**Files:**
- Modify: `src/ui/conflictDetector.ts:20-26,34-36`
- Modify: `src/test/unit/conflictDetector.test.ts`

**Interfaces:**
- Consumes: `vscode`
- Produces: Lean `ConflictDetectorDependencies`

- [ ] **Step 1: Collapse `ConflictDetectorDependencies` and `ConflictChangeDependencies`**

Merge into a single minimal options interface. Remove unnecessary fields where standard VS Code API methods can be used directly or mocked via `getVscode()`.

- [ ] **Step 2: Run unit tests**

Run: `npm run compile-tests && mocha out/test/unit/conflictDetector.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/conflictDetector.ts src/test/unit/conflictDetector.test.ts
git commit -m "refactor(ui): simplify conflict detector dependencies"
```

---

### Task 16: Simplify `FormattingProviderDependencies` in `formatProvider.ts` (Audit Point 15)

**Files:**
- Modify: `src/formatting/formatProvider.ts:17-25`
- Modify: `src/test/unit/formatProvider.test.ts`

**Interfaces:**
- Consumes: None
- Produces: Lean `FormattingProviderDependencies` (only keeping `writeLog` and test overrides)

- [ ] **Step 1: Prune redundant optional properties in `FormattingProviderDependencies`**

In `src/formatting/formatProvider.ts`, prune unused/speculative fields from `FormattingProviderDependencies`.

- [ ] **Step 2: Run unit tests**

Run: `npm run compile-tests && mocha out/test/unit/formatProvider.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/formatting/formatProvider.ts src/test/unit/formatProvider.test.ts
git commit -m "refactor(formatting): streamline formatting provider dependencies"
```

---

### Task 17: Simplify `StatusBarDependencies` in `statusBar.ts` (Audit Point 16)

**Files:**
- Modify: `src/ui/statusBar.ts:39-46`
- Modify: `src/test/unit/statusBar.test.ts`

**Interfaces:**
- Consumes: `ClientManager`
- Produces: Lean `StatusBarDependencies`

- [ ] **Step 1: Prune redundant callback overrides in `StatusBarDependencies`**

Keep `clientManager` as required, and simplify the rest to use `getVscode()` by default.

- [ ] **Step 2: Run unit tests**

Run: `npm run compile-tests && mocha out/test/unit/statusBar.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/statusBar.ts src/test/unit/statusBar.test.ts
git commit -m "refactor(ui): streamline status bar dependencies"
```

---

### Task 18: Streamline `CommandDependencies` in `commands.ts` (Audit Point 4)

**Files:**
- Modify: `src/ui/commands.ts:28-51`
- Modify: `src/test/unit/commands.test.ts`

**Interfaces:**
- Consumes: `ClientManager`, `Output`, `GoNavigationService`
- Produces: Streamlined `CommandDependencies` without 20+ defensive `??` fallbacks

- [ ] **Step 1: Simplify `CommandDependencies`**

In `src/ui/commands.ts`:
Keep only required dependencies (`clientManager`, `output`, `navigation`). Use direct imports for `probeBuf`, `findBufRoot`, `readConfig`, `resolveGoImplementation`, `formatProtoText`, and direct `vsc` API methods instead of 18 optional fallback properties.

- [ ] **Step 2: Update unit tests in `commands.test.ts`**

Adjust any tests passing obsolete bag fields to mock at module boundaries or pass the streamlined options.

- [ ] **Step 3: Run unit tests**

Run: `npm run compile-tests && mocha out/test/unit/commands.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/ui/commands.ts src/test/unit/commands.test.ts
git commit -m "refactor(ui): streamline CommandDependencies and eliminate fallback clutter"
```

---

### Task 19: Streamline Range Formatting / Text Diff Engine (Audit Point 1)

**Files:**
- Modify: `src/formatting/formatProvider.ts:60-95`
- Modify: `src/formatting/textDiff.ts`
- Modify: `src/test/unit/textDiff.test.ts`
- Modify: `src/test/unit/formatProvider.test.ts`

**Interfaces:**
- Consumes: `originalText`, `formattedText`
- Produces: Concise range-formatting edit calculation (prefix/suffix trim + single range edit) or streamlined diff

- [ ] **Step 1: Simplify range formatting edit generation**

In `src/formatting/textDiff.ts`, replace the 179-line quadratic LCS matrix diff with a trimmed common-prefix/suffix diff:
Compute `prefix` and `suffix`, then replace the modified span between `prefix` and `length - suffix`. This produces clean, precise, minimal line edits without the 180-line LCS matrix engine.

- [ ] **Step 2: Update tests in `textDiff.test.ts` and `formatProvider.test.ts`**

Verify that all diff tests and format provider tests pass with the streamlined implementation.

- [ ] **Step 3: Run full verification suite**

Run: `npm run verify`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/formatting/textDiff.ts src/formatting/formatProvider.ts src/test/unit/textDiff.test.ts src/test/unit/formatProvider.test.ts
git commit -m "refactor(formatting): replace LCS matrix with streamlined prefix-suffix diff"
```
