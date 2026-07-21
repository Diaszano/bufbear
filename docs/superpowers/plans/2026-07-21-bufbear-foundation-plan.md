# BufBear Foundation and Buf LSP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the standalone BufBear VS Code extension and deliver secure, multi-root Buf Language Server integration with health, lifecycle, status, tests, CI, and VSIX packaging.

**Architecture:** A bundled TypeScript extension launches one `buf lsp serve` process per effective workspace root through `vscode-languageclient/node`. Pure modules handle process execution, executable probing, root discovery, bounded caches, and restart policy; thin VS Code adapters handle configuration, trust, UI, commands, and activation.

**Tech Stack:** Node.js 22+, TypeScript 7.0.2, VS Code API 1.125+, `vscode-languageclient` 10.1.0, esbuild 0.28.1, ESLint 10, typescript-eslint 8.65, Mocha 11.7, `@vscode/test-electron` 3.0, `@vscode/vsce` 3.9.

## Global Constraints

- Repository: `https://github.com/Diaszano/bufbear`.
- Local project root: `~/Documents/GitHub/bufbear`.
- Package name: `bufbear`.
- Display name: `BufBear`.
- Publisher: `diaszano`.
- Extension ID: `diaszano.bufbear`.
- Marketplace description: `Advanced Protocol Buffers support for VS Code, powered by Buf.`
- Tagline: `Navigate your Protobuf jungle.`
- Language id: `proto3`.
- Configuration namespace: `bufBear`.
- VS Code engine: `^1.125.0`.
- Node development runtime: 22 or newer.
- The extension is desktop/remote only in v1; do not add a `browser` entry.
- Buf compatibility is capability-based: both `buf --version` and `buf lsp serve --help` must succeed.
- Never use a shell. All child processes use argument arrays and `shell: false`.
- Do not download Buf automatically.
- Do not start processes in untrusted workspaces.
- Do not collect telemetry.
- Pure modules must not import `vscode`.
- Type-check with `tsc --noEmit`; bundle with esbuild.
- Use TDD for pure behavior and one Conventional Commit per task.
- Commit messages and code are in English with no AI attribution trailers.

---

## Target file structure

```text
.
├── .github/
│   └── workflows/ci.yml
├── .vscode/
│   ├── extensions.json
│   ├── launch.json
│   └── tasks.json
├── resources/
│   └── bufbear.png
├── syntaxes/
│   └── proto3.tmLanguage.json
├── src/
│   ├── config/
│   │   ├── config.ts
│   │   └── types.ts
│   ├── lsp/
│   │   ├── bufExecutable.ts
│   │   ├── clientFactory.ts
│   │   ├── clientManager.ts
│   │   ├── restartPolicy.ts
│   │   ├── rootDiscovery.ts
│   │   └── serverState.ts
│   ├── platform/
│   │   ├── boundedCache.ts
│   │   ├── output.ts
│   │   └── processRunner.ts
│   ├── test/
│   │   ├── integration/
│   │   │   ├── runTest.ts
│   │   │   └── suite/index.test.ts
│   │   └── unit/
│   │       ├── boundedCache.test.ts
│   │       ├── bufExecutable.test.ts
│   │       ├── restartPolicy.test.ts
│   │       └── rootDiscovery.test.ts
│   ├── ui/
│   │   ├── commands.ts
│   │   ├── conflictDetector.ts
│   │   └── statusBar.ts
│   └── extension.ts
├── CHANGELOG.md
├── LICENSE
├── README.md
├── THIRD_PARTY_NOTICES.md
├── eslint.config.mjs
├── esbuild.mjs
├── language-configuration.json
├── package.json
├── tsconfig.json
└── .vscodeignore
```

---

### Task 1: Scaffold the independent extension

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.mjs`
- Create: `eslint.config.mjs`
- Create: `.gitignore`
- Create: `.vscodeignore`
- Create: `.vscode/extensions.json`
- Create: `.vscode/tasks.json`
- Create: `.vscode/launch.json`
- Create: `src/extension.ts`
- Create: `language-configuration.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a type-checkable, bundleable extension package with the `proto3` language registered and commands/configuration declared for later tasks.

- [ ] **Step 1: Initialize the repository**

```bash
mkdir -p ~/Documents/GitHub/bufbear
cd ~/Documents/GitHub/bufbear
git init
git branch -M main
npm init -y
mkdir -p src/{config,lsp,platform,test/{unit,integration/suite},ui} syntaxes resources .vscode .github/workflows
```

Expected: repository exists on branch `main`.

- [ ] **Step 2: Replace `package.json`**

```json
{
  "name": "bufbear",
  "displayName": "BufBear",
  "description": "Advanced Protocol Buffers support for VS Code, powered by Buf.",
  "version": "0.1.0",
  "publisher": "diaszano",
  "license": "MIT",
  "homepage": "https://github.com/Diaszano/bufbear#readme",
  "repository": {
    "type": "git",
    "url": "https://github.com/Diaszano/bufbear.git"
  },
  "bugs": {
    "url": "https://github.com/Diaszano/bufbear/issues"
  },
  "engines": {
    "vscode": "^1.125.0"
  },
  "categories": [
    "Programming Languages",
    "Linters",
    "Formatters"
  ],
  "keywords": [
    "protobuf",
    "proto3",
    "buf",
    "lsp",
    "grpc"
  ],
  "main": "./dist/extension.js",
  "extensionKind": [
    "workspace"
  ],
  "activationEvents": [
    "onLanguage:proto3",
    "workspaceContains:**/buf.yaml",
    "onCommand:bufBear.restartServer",
    "onCommand:bufBear.checkHealth"
  ],
  "contributes": {
    "languages": [
      {
        "id": "proto3",
        "extensions": [".proto"],
        "aliases": ["Protocol Buffers", "Protobuf"],
        "configuration": "./language-configuration.json"
      }
    ],
    "grammars": [
      {
        "language": "proto3",
        "scopeName": "source.proto",
        "path": "./syntaxes/proto3.tmLanguage.json"
      }
    ],
    "commands": [
      {
        "command": "bufBear.restartServer",
        "title": "BufBear: Restart Language Server"
      },
      {
        "command": "bufBear.showOutput",
        "title": "BufBear: Show Output"
      },
      {
        "command": "bufBear.checkHealth",
        "title": "BufBear: Check Health"
      },
      {
        "command": "bufBear.openSettings",
        "title": "BufBear: Open Settings"
      },
      {
        "command": "bufBear.goToGeneratedImplementation",
        "title": "BufBear: Go to Generated Implementation"
      }
    ],
    "configuration": {
      "title": "BufBear",
      "properties": {
        "bufBear.lsp.enabled": {
          "type": "boolean",
          "default": true,
          "scope": "resource",
          "description": "Start the Buf Language Server for Protobuf semantic features."
        },
        "bufBear.buf.path": {
          "type": "string",
          "default": "buf",
          "scope": "resource",
          "description": "Executable path or command name for the Buf CLI."
        },
        "bufBear.buf.trace.server": {
          "type": "string",
          "enum": ["off", "messages", "verbose"],
          "default": "off",
          "scope": "resource",
          "description": "Trace communication with the Buf Language Server."
        },
        "bufBear.notifications.missingBuf": {
          "type": "boolean",
          "default": true,
          "scope": "resource",
          "description": "Show one actionable notification when Buf is missing or incompatible."
        },
        "bufBear.go.enabled": {
          "type": "boolean",
          "default": true,
          "scope": "resource",
          "description": "Enable navigation to source-relative generated Go files."
        },
        "bufBear.go.genRoot": {
          "type": "string",
          "default": "gen/proto-go",
          "scope": "resource",
          "description": "Generated Go root relative to the detected Buf root."
        },
        "bufBear.go.sourceRelative": {
          "type": "boolean",
          "default": true,
          "scope": "resource",
          "description": "Map generated Go paths from the Protobuf source-relative path."
        },
        "bufBear.conflictWarning.enabled": {
          "type": "boolean",
          "default": true,
          "scope": "window",
          "description": "Warn once when another full Protobuf language extension is active."
        }
      }
    }
  },
  "scripts": {
    "clean": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true});require('node:fs').rmSync('out',{recursive:true,force:true})\"",
    "check-types": "tsc --noEmit",
    "compile-tests": "tsc -p tsconfig.json --outDir out --noEmit false",
    "lint": "eslint .",
    "test:unit": "npm run compile-tests && mocha \"out/test/unit/**/*.test.js\"",
    "test:integration": "npm run compile-tests && node out/test/integration/runTest.js",
    "bundle": "node esbuild.mjs",
    "package": "npm run check-types && node esbuild.mjs --production",
    "package:vsix": "npm run verify && npm run package && vsce package --out bufbear-0.1.0.vsix",
    "verify": "npm run lint && npm run check-types && npm run test:unit",
    "vscode:prepublish": "npm run package"
  },
  "dependencies": {
    "vscode-languageclient": "^10.1.0"
  },
  "devDependencies": {
    "@eslint/js": "^10.7.0",
    "@types/mocha": "^10.0.10",
    "@types/node": "^22.20.1",
    "@types/vscode": "^1.125.0",
    "@vscode/test-electron": "^3.0.0",
    "@vscode/vsce": "^3.9.2",
    "esbuild": "^0.28.1",
    "eslint": "^10.7.0",
    "mocha": "^11.7.6",
    "typescript": "^7.0.2",
    "typescript-eslint": "^8.65.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "rootDir": "src",
    "outDir": "out",
    "strict": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "types": ["node", "vscode", "mocha"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "out"]
}
```

- [ ] **Step 4: Create `esbuild.mjs`**

```js
import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  outfile: "dist/extension.js",
  external: ["vscode"],
  minify: production,
  sourcemap: production ? false : "inline",
  sourcesContent: !production,
  logLevel: "info"
});

if (watch) {
  await context.watch();
  console.log("[watch] build started");
} else {
  try {
    await context.rebuild();
  } finally {
    await context.dispose();
  }
}
```

- [ ] **Step 5: Create `eslint.config.mjs`**

```js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "out/**", "node_modules/**"]
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { "checksVoidReturn": { "arguments": false } }
      ]
    }
  }
);
```

- [ ] **Step 6: Create `language-configuration.json`**

```json
{
  "comments": {
    "lineComment": "//",
    "blockComment": ["/*", "*/"]
  },
  "brackets": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ["<", ">"]
  ],
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "(", "close": ")" },
    { "open": "<", "close": ">" },
    { "open": "\"", "close": "\"", "notIn": ["string", "comment"] }
  ],
  "surroundingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ["<", ">"],
    ["\"", "\""]
  ],
  "indentationRules": {
    "increaseIndentPattern": "^.*\\{[^}\"']*$",
    "decreaseIndentPattern": "^(.*\\*/)?\\s*\\}.*$"
  },
  "wordPattern": "(-?\\d*\\.\\d\\w*)|([^`~!@#%^&*()\\-=+\\[{\\]}\\\\|;:'\",.<>/?\\s]+)"
}
```

- [ ] **Step 7: Create the minimal `src/extension.ts`**

```ts
import type { ExtensionContext } from "vscode";

export function activate(_context: ExtensionContext): void {
  // Tasks 5–7 wire services and UI.
}

export function deactivate(): void {
  // Tasks 5–7 stop managed clients.
}
```

- [ ] **Step 8: Create ignores and VS Code development files**

`.gitignore`:

```gitignore
node_modules/
dist/
out/
.vscode-test/
*.vsix
.DS_Store
```

`.vscodeignore`:

```gitignore
.github/**
.vscode/**
src/**
out/**
node_modules/**
eslint.config.mjs
esbuild.mjs
tsconfig.json
**/*.map
**/*.test.*
```

`.vscode/extensions.json`:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "connor4312.esbuild-problem-matchers"
  ]
}
```

`.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "watch",
      "type": "shell",
      "command": "npm run bundle -- --watch",
      "isBackground": true,
      "problemMatcher": "$esbuild-watch"
    }
  ]
}
```

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run BufBear",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "watch"
    }
  ]
}
```

- [ ] **Step 9: Install and verify the scaffold**

```bash
npm install
npm run lint
npm run check-types
npm run bundle
test -f dist/extension.js
```

Expected: all commands exit 0.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold bufbear extension"
```

---

### Task 2: Add legal notices, baseline grammar, and BufBear branding

**Files:**
- Create: `LICENSE`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `syntaxes/proto3.tmLanguage.json`
- Create: `resources/bufbear.png`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 manifest.
- Produces: packaged syntax highlighting and correct MIT attribution.

- [ ] **Step 1: Copy only the public MIT-licensed grammar when needed**

Obtain the TextMate grammar from the public upstream project or write a new grammar. When copying, keep the upstream copyright notice in `THIRD_PARTY_NOTICES.md`.

Do not copy code from private or unrelated repositories, and do not reuse upstream icon artwork.

- [ ] **Step 2: Create the original BufBear icon**

Create `resources/bufbear.png` as an original, friendly bear mascot carrying or inspecting a `.proto` file. Use a purple, blue, and yellow palette, keep the silhouette readable at small sizes, use a square canvas, and export a crisp 128×128 or larger PNG.

Verify the design does not contain third-party logos, copied artwork, tiny text, or details that disappear at Marketplace thumbnail size.

- [ ] **Step 3: Create `LICENSE`**

Use the standard MIT License and set:

```text
Copyright (c) 2026 Lucas Dias
```

- [ ] **Step 4: Create `THIRD_PARTY_NOTICES.md`**

```markdown
# Third-Party Notices

## vscode-proto

BufBear may include portions of the public `sanketh-nm/vscode-proto`
TextMate grammar.

Source: https://github.com/sanketh-nm/vscode-proto  
License: MIT

The original copyright and permission notice are retained in accordance
with the MIT License.
```

- [ ] **Step 5: Add the icon to `package.json`**

Add at top-level:

```json
"icon": "resources/bufbear.png",
```

- [ ] **Step 6: Verify grammar JSON and package contents**

```bash
node -e "JSON.parse(require('node:fs').readFileSync('syntaxes/proto3.tmLanguage.json','utf8'))"
npm run package
npx vsce ls
```

Expected: grammar, language configuration, icon, README and license files, and `dist/extension.js` are listed; source and `node_modules` are absent.

- [ ] **Step 7: Commit**

```bash
git add LICENSE THIRD_PARTY_NOTICES.md syntaxes resources package.json
git commit -m "chore: add grammar assets and third-party notices"
```

---

### Task 3: Implement platform primitives

**Files:**
- Create: `src/platform/boundedCache.ts`
- Create: `src/platform/processRunner.ts`
- Create: `src/platform/output.ts`
- Create: `src/test/unit/boundedCache.test.ts`
- Create: `src/test/unit/processRunner.test.ts`

**Interfaces:**
- Produces:

```ts
export class BoundedCache<K, V> {
  constructor(maxEntries: number);
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): boolean;
  clear(): void;
  get size(): number;
}

export interface ProcessRequest {
  executable: string;
  args: readonly string[];
  cwd?: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

export function runProcess(request: ProcessRequest): Promise<ProcessResult>;
```

- [ ] **Step 1: Write bounded cache tests**

```ts
import assert from "node:assert/strict";
import { BoundedCache } from "../../platform/boundedCache.js";

describe("BoundedCache", () => {
  it("evicts the least recently used entry", () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    assert.equal(cache.get("a"), 1);
    cache.set("c", 3);
    assert.equal(cache.get("b"), undefined);
    assert.equal(cache.get("a"), 1);
    assert.equal(cache.get("c"), 3);
  });

  it("rejects non-positive capacity", () => {
    assert.throws(() => new BoundedCache(0), /positive/);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
npm run compile-tests
npx mocha "out/test/unit/boundedCache.test.js"
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `BoundedCache`**

```ts
export class BoundedCache<K, V> {
  readonly #values = new Map<K, V>();

  public constructor(private readonly maxEntries: number) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new RangeError("maxEntries must be a positive integer");
    }
  }

  public get size(): number {
    return this.#values.size;
  }

  public get(key: K): V | undefined {
    const value = this.#values.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.#values.delete(key);
    this.#values.set(key, value);
    return value;
  }

  public set(key: K, value: V): void {
    this.#values.delete(key);
    this.#values.set(key, value);
    while (this.#values.size > this.maxEntries) {
      const oldest = this.#values.keys().next().value as K | undefined;
      if (oldest === undefined) {
        break;
      }
      this.#values.delete(oldest);
    }
  }

  public delete(key: K): boolean {
    return this.#values.delete(key);
  }

  public clear(): void {
    this.#values.clear();
  }
}
```

- [ ] **Step 4: Write process runner tests**

Test a successful Node child, a non-zero exit, timeout, and invalid executable. The invalid executable must resolve a result or throw a typed spawn error; it must never invoke a shell.

```ts
import assert from "node:assert/strict";
import { runProcess } from "../../platform/processRunner.js";

describe("runProcess", () => {
  it("captures stdout without a shell", async () => {
    const result = await runProcess({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('ok')"],
      timeoutMs: 1000
    });
    assert.equal(result.stdout, "ok");
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
  });

  it("kills a timed-out process", async () => {
    const result = await runProcess({
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10000)"],
      timeoutMs: 25
    });
    assert.equal(result.timedOut, true);
  });
});
```

- [ ] **Step 5: Implement `runProcess`**

Use `spawn(request.executable, [...request.args], {shell: false, ...})`, bounded stdout/stderr buffers of 1 MiB each, timeout cleanup, and a single-settlement guard. Reject executable values containing NUL, CR, or LF.

- [ ] **Step 6: Create `src/platform/output.ts`**

```ts
import * as vscode from "vscode";

export type LogLevel = "debug" | "info" | "warn" | "error";

export class Output implements vscode.Disposable {
  readonly #channel = vscode.window.createOutputChannel("BufBear");

  public write(level: LogLevel, component: string, message: string, root?: string): void {
    const timestamp = new Date().toISOString();
    const rootLabel = root ? ` [${root}]` : "";
    this.#channel.appendLine(`${timestamp} ${level.toUpperCase()}${rootLabel} [${component}] ${message}`);
  }

  public show(): void {
    this.#channel.show(true);
  }

  public dispose(): void {
    this.#channel.dispose();
  }
}
```

- [ ] **Step 7: Verify**

```bash
npm run verify
```

Expected: all unit tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/platform src/test/unit
git commit -m "feat: add process and cache platform primitives"
```

---

### Task 4: Implement configuration, Buf probing, and root discovery

**Files:**
- Create: `src/config/types.ts`
- Create: `src/config/config.ts`
- Create: `src/lsp/bufExecutable.ts`
- Create: `src/lsp/rootDiscovery.ts`
- Create: `src/test/unit/bufExecutable.test.ts`
- Create: `src/test/unit/rootDiscovery.test.ts`

**Interfaces:**
- Produces:

```ts
export interface BufBearConfig {
  lspEnabled: boolean;
  bufPath: string;
  traceServer: "off" | "messages" | "verbose";
  missingBufNotification: boolean;
  goEnabled: boolean;
  goGenRoot: string;
  goSourceRelative: boolean;
  conflictWarningEnabled: boolean;
}

export interface BufProbe {
  executable: string;
  version: string;
  supportsLsp: boolean;
}

export async function probeBuf(executable: string): Promise<BufProbe>;
export async function findBufRoot(filePath: string, workspaceBoundary?: string): Promise<string | undefined>;
```

- [ ] **Step 1: Implement typed configuration**

`src/config/types.ts`:

```ts
export type TraceServer = "off" | "messages" | "verbose";

export interface BufBearConfig {
  readonly lspEnabled: boolean;
  readonly bufPath: string;
  readonly traceServer: TraceServer;
  readonly missingBufNotification: boolean;
  readonly goEnabled: boolean;
  readonly goGenRoot: string;
  readonly goSourceRelative: boolean;
  readonly conflictWarningEnabled: boolean;
}
```

`src/config/config.ts`:

```ts
import * as vscode from "vscode";
import type { BufBearConfig, TraceServer } from "./types.js";

export function readConfig(resource?: vscode.Uri): BufBearConfig {
  const config = vscode.workspace.getConfiguration("bufBear", resource);
  return {
    lspEnabled: config.get("lsp.enabled", true),
    bufPath: config.get("buf.path", "buf"),
    traceServer: config.get<TraceServer>("buf.trace.server", "off"),
    missingBufNotification: config.get("notifications.missingBuf", true),
    goEnabled: config.get("go.enabled", true),
    goGenRoot: config.get("go.genRoot", "gen/proto-go"),
    goSourceRelative: config.get("go.sourceRelative", true),
    conflictWarningEnabled: config.get("conflictWarning.enabled", true)
  };
}
```

- [ ] **Step 2: Write Buf probe tests**

Inject a `ProcessRunner` function so tests do not require Buf.

Cover:

- trimmed version parsing;
- capability success;
- unsupported `lsp serve`;
- invalid executable strings;
- five-second timeout passed to both calls.

- [ ] **Step 3: Implement `probeBuf`**

```ts
import { runProcess, type ProcessResult } from "../platform/processRunner.js";

export interface BufProbe {
  readonly executable: string;
  readonly version: string;
  readonly supportsLsp: boolean;
}

type Runner = (request: {
  executable: string;
  args: readonly string[];
  timeoutMs: number;
}) => Promise<ProcessResult>;

export async function probeBuf(
  executable: string,
  runner: Runner = runProcess
): Promise<BufProbe> {
  if (executable.length === 0 || /[\0\r\n]/u.test(executable)) {
    throw new Error("Buf executable must be a non-empty path or command name");
  }

  const version = await runner({
    executable,
    args: ["--version"],
    timeoutMs: 5000
  });
  if (version.exitCode !== 0 || version.timedOut) {
    throw new Error("Buf version probe failed");
  }

  const lsp = await runner({
    executable,
    args: ["lsp", "serve", "--help"],
    timeoutMs: 5000
  });

  return {
    executable,
    version: version.stdout.trim(),
    supportsLsp: lsp.exitCode === 0 && !lsp.timedOut
  };
}
```

- [ ] **Step 4: Write root discovery tests**

Use `fs.mkdtemp`, create nested directories, `buf.yaml`, workspace boundaries, and an orphan file.

Required cases:

- nearest marker wins;
- search stops at the workspace boundary;
- orphan returns workspace boundary;
- no boundary and no marker returns undefined.

- [ ] **Step 5: Implement root discovery**

Use asynchronous `fs.promises.access`, `path.dirname`, and a `BoundedCache<string, string | null>(512)`. Cache per starting directory and expose `invalidateRootCache(directory?: string)`.

- [ ] **Step 6: Verify**

```bash
npm run verify
```

Expected: probe and root-discovery tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/config src/lsp/bufExecutable.ts src/lsp/rootDiscovery.ts src/test/unit
git commit -m "feat: add buf probing and root discovery"
```

---

### Task 5: Implement client factory and restart policy

**Files:**
- Create: `src/lsp/serverState.ts`
- Create: `src/lsp/restartPolicy.ts`
- Create: `src/lsp/clientFactory.ts`
- Create: `src/test/unit/restartPolicy.test.ts`

**Interfaces:**
- Produces:

```ts
export type ServerState = "starting" | "ready" | "degraded" | "stopped" | "error";

export class RestartPolicy {
  recordFailure(now?: number): number | undefined;
  reset(): void;
}

export interface ClientFactoryInput {
  root: vscode.Uri;
  executable: string;
  trace: "off" | "messages" | "verbose";
  output: Output;
}

export function createLanguageClient(input: ClientFactoryInput): LanguageClient;
```

- [ ] **Step 1: Write restart policy tests**

Expected schedule for failures inside five minutes:

```ts
assert.equal(policy.recordFailure(0), 0);
assert.equal(policy.recordFailure(1), 1000);
assert.equal(policy.recordFailure(2), 3000);
assert.equal(policy.recordFailure(3), 10000);
assert.equal(policy.recordFailure(4), undefined);
```

Also test that failures older than five minutes are discarded and `reset()` restarts at zero.

- [ ] **Step 2: Implement `RestartPolicy`**

Use a five-minute rolling window and delays `[0, 1000, 3000, 10000]`.

- [ ] **Step 3: Implement `serverState.ts`**

```ts
export type ServerState = "starting" | "ready" | "degraded" | "stopped" | "error";

export interface RootServerStatus {
  readonly root: string;
  readonly state: ServerState;
  readonly detail?: string;
}
```

- [ ] **Step 4: Implement `clientFactory.ts`**

Use:

```ts
import {
  LanguageClient,
  RevealOutputChannelOn,
  State,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions
} from "vscode-languageclient/node.js";
```

Server options:

```ts
const serverOptions: ServerOptions = {
  run: {
    command: input.executable,
    args: ["lsp", "serve"],
    options: { cwd: input.root.fsPath, shell: false },
    transport: TransportKind.stdio
  },
  debug: {
    command: input.executable,
    args: ["lsp", "serve", "--debug"],
    options: { cwd: input.root.fsPath, shell: false },
    transport: TransportKind.stdio
  }
};
```

Client options:

```ts
const clientOptions: LanguageClientOptions = {
  documentSelector: [
    {
      language: "proto3",
      scheme: "file",
      pattern: new vscode.RelativePattern(input.root, "**/*.proto")
    },
    {
      scheme: "file",
      pattern: new vscode.RelativePattern(input.root, "**/{buf.yaml,buf.gen.yaml,buf.lock}")
    }
  ],
  workspaceFolder: {
    uri: input.root,
    name: path.basename(input.root.fsPath),
    index: 0
  },
  synchronize: {
    fileEvents: vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(input.root, "**/{*.proto,buf.yaml,buf.gen.yaml,buf.lock}")
    )
  },
  revealOutputChannelOn: RevealOutputChannelOn.Never,
  traceOutputChannel: vscode.window.createOutputChannel(`BufBear LSP — ${path.basename(input.root.fsPath)}`)
};
```

Set trace using the language client API after construction. Map client state changes into the manager through callbacks rather than letting UI depend directly on `LanguageClient`.

- [ ] **Step 5: Verify type checking and unit tests**

```bash
npm run verify
```

- [ ] **Step 6: Commit**

```bash
git add src/lsp src/test/unit
git commit -m "feat: add language client factory and restart policy"
```

---

### Task 6: Implement multi-root client management

**Files:**
- Create: `src/lsp/clientManager.ts`
- Create: `src/test/unit/clientManager.test.ts`

**Interfaces:**
- Consumes: configuration, Buf probe, root discovery, client factory, restart policy, output.
- Produces:

```ts
export interface ClientManager {
  ensureForDocument(document: vscode.TextDocument): Promise<void>;
  restartForResource(resource?: vscode.Uri, reason?: string): Promise<void>;
  stopForRoot(root: string): Promise<void>;
  stopAll(): Promise<void>;
  statuses(): readonly RootServerStatus[];
  onDidChangeStatus: vscode.Event<readonly RootServerStatus[]>;
}
```

- [ ] **Step 1: Define injectable dependencies**

The manager constructor receives:

```ts
interface ClientManagerDependencies {
  readonly output: Output;
  readonly createClient: typeof createLanguageClient;
  readonly probeBuf: typeof probeBuf;
  readonly findRoot: typeof findBufRoot;
  readonly isTrusted: () => boolean;
}
```

This keeps lifecycle tests independent of real processes.

- [ ] **Step 2: Write lifecycle tests**

Use fake clients to verify:

- repeated documents under one root create one client;
- two roots create two clients;
- disabled LSP creates none;
- untrusted workspace creates none;
- restart affects one root;
- stopping all waits for every fake client;
- a failed probe creates `degraded`, not an unhandled rejection;
- automatic retries stop after the restart policy is exhausted.

- [ ] **Step 3: Implement manager state**

Store clients in:

```ts
readonly #clients = new Map<string, ManagedRootClient>();
readonly #statusEmitter = new vscode.EventEmitter<readonly RootServerStatus[]>();
readonly #notifiedMissingBuf = new Set<string>();
```

Normalize root keys with `path.resolve` and platform-aware casing.

- [ ] **Step 4: Implement startup flow**

For one document:

1. reject non-file or non-`proto3`;
2. read resource configuration;
3. require `lspEnabled`;
4. require workspace trust;
5. discover effective root;
6. reuse existing client;
7. probe Buf;
8. require `supportsLsp`;
9. create and start the client;
10. publish state changes.

Do not hold a global lock. Keep one startup promise per root to deduplicate concurrent open events.

- [ ] **Step 5: Implement bounded restart handling**

On unexpected stop:

- record failure;
- update state;
- schedule only the affected root;
- clear the timer on stop/deactivation;
- do not retry after `undefined`;
- log every transition.

- [ ] **Step 6: Verify**

```bash
npm run verify
```

Expected: multi-root lifecycle tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lsp/clientManager.ts src/test/unit/clientManager.test.ts
git commit -m "feat: manage buf language clients per workspace root"
```

---

### Task 7: Add status, commands, conflict detection, and activation

**Files:**
- Create: `src/ui/statusBar.ts`
- Create: `src/ui/commands.ts`
- Create: `src/ui/conflictDetector.ts`
- Modify: `src/extension.ts`
- Create: `src/test/integration/runTest.ts`
- Create: `src/test/integration/suite/index.test.ts`

**Interfaces:**
- Consumes: `ClientManager`, `Output`, configuration.
- Produces: user-visible lifecycle controls and extension activation.

- [ ] **Step 1: Implement the status bar**

Show only for active `.proto` or Buf config files. Render:

- `$(sync~spin) BufBear` for starting;
- `$(check) BufBear` for ready;
- `$(warning) BufBear` for degraded;
- `$(error) BufBear` for error;
- `$(circle-slash) BufBear` for untrusted/disabled.

Set command to an internal quick-pick command registered in `commands.ts`.

- [ ] **Step 2: Implement commands**

Register every declared command and add all disposables to `context.subscriptions`.

Health command output:

```text
BufBear health
- Workspace trusted: yes/no
- Resource: <relative path>
- Root: <relative root or none>
- Buf executable: <configured value>
- Buf version: <version or unavailable>
- LSP support: yes/no
- Client state: <state>
```

Do not include environment variables.

- [ ] **Step 3: Implement conflict detection**

Known extension ids:

```ts
const FULL_PROTO_EXTENSIONS = [
  "bufbuild.vscode-buf",
  "zxh404.vscode-proto3",
  "sankethdev.vscode-proto"
] as const;
```

Warn once per session only when one is installed and active, `bufBear.lsp.enabled` is true, and conflict warnings are enabled.

Offer:

- `Open Extensions`
- `Disable BufBear LSP`
- `Ignore`

The disable action updates `bufBear.lsp.enabled` at workspace scope.

- [ ] **Step 4: Wire `src/extension.ts`**

Activation order:

1. create output;
2. create manager;
3. create status bar;
4. register commands;
5. subscribe to active editor/open document/workspace-folder/configuration/trust events;
6. check conflicts;
7. ensure a client for already-open Protobuf documents.

Deactivation:

```ts
let shutdown: (() => Promise<void>) | undefined;

export async function deactivate(): Promise<void> {
  await shutdown?.();
}
```

Set `shutdown` during activation to stop all clients with a five-second overall timeout and dispose UI resources.

- [ ] **Step 5: Add integration harness**

`runTest.ts` uses `@vscode/test-electron` and opens a fixture workspace. The first integration test verifies the extension activates, command registration succeeds, and a `.proto` document receives language id `proto3`.

- [ ] **Step 6: Verify**

```bash
npm run verify
npm run test:integration
```

Expected: unit and extension-host tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/extension.ts src/ui src/test/integration
git commit -m "feat: add bufbear lifecycle ui and commands"
```

---

### Task 8: Add CI, documentation, and packaging verification

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Create: `CHANGELOG.md`
- Modify: `.vscodeignore`
- Modify: `package.json`

**Interfaces:**
- Produces: reproducible verification on three operating systems and a publishable VSIX.

- [ ] **Step 1: Create CI**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  verify:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run verify
      - run: npm run package
      - run: npx vsce package --out bufbear-${{ runner.os }}.vsix
      - uses: actions/upload-artifact@v4
        with:
          name: bufbear-${{ runner.os }}
          path: bufbear-${{ runner.os }}.vsix
```

- [ ] **Step 2: Write README**

Begin with the canonical product identity:

```markdown
# BufBear

> Navigate your Protobuf jungle.

Advanced Protocol Buffers support for VS Code, powered by Buf.
```

Required sections:

- product summary;
- feature list;
- requirements;
- installation from VSIX;
- Buf installation link;
- settings table;
- commands;
- multi-root and remote behavior;
- official Buf extension conflict;
- workspace trust;
- troubleshooting;
- privacy;
- generated Go scope;
- upstream attribution;
- development commands.

- [ ] **Step 3: Write CHANGELOG**

```markdown
# Changelog

## 0.1.0 — 2026-07-21

- Added Protobuf syntax and language configuration.
- Added Buf LSP integration with one client per workspace root.
- Added health, restart, output, and settings commands.
- Added status and conflict detection.
- Added cross-platform build, tests, and VSIX packaging.
```

- [ ] **Step 4: Verify package contents and size**

```bash
npm ci
npm run verify
npm run package:vsix
npx vsce ls
node -e "const s=require('node:fs').statSync('bufbear-0.1.0.vsix').size;if(s>2*1024*1024)process.exit(1);console.log(s)"
```

Expected:

- VSIX exists;
- no source/tests/node_modules included;
- size below 2 MiB;
- LICENSE and THIRD_PARTY_NOTICES included.

- [ ] **Step 5: Run the manual foundation matrix**

Verify on at least:

- macOS arm64 with Buf installed;
- one environment without Buf;
- a multi-root workspace;
- an untrusted workspace;
- another Protobuf language extension enabled.

Record results in the pull request description, not in permanent source files.

- [ ] **Step 6: Commit**

```bash
git add .github README.md CHANGELOG.md package.json .vscodeignore package-lock.json
git commit -m "docs: add ci packaging and extension documentation"
```

---

## Plan self-review

- The plan creates an independent public extension and does not depend on any private repository.
- The semantic feature source is `buf lsp serve`; there is no duplicate parser, lint pipeline, or formatter pipeline.
- Process execution is shell-free and trust-aware.
- Multi-root lifecycle, retry bounds, diagnostics, status, conflicts, and packaging have explicit tasks.
- Generated Go navigation is intentionally deferred to the companion implementation plan.
- Every task ends with verification and a Conventional Commit.
