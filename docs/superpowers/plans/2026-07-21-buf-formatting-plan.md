# Protobuf Formatter (`buf format`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Protobuf document and range formatting in BufBear using `buf format -` via `DocumentFormattingEditProvider`, `DocumentRangeFormattingEditProvider`, and `bufBear.formatDocument` command.

**Architecture:** A pure execution helper `formatProtoText` wraps `runProcess` to send document text over `stdin` to `buf format -`. VS Code `DocumentFormattingEditProvider` and `DocumentRangeFormattingEditProvider` invoke this engine to return non-destructive `TextEdit` replacements. Erroneous format-on-save requests log warnings to the Output Channel while manual command triggers present user-facing notifications.

**Tech Stack:** TypeScript, VS Code Extension API (`vscode`), Node.js `child_process` (via `runProcess`), Mocha test framework, esbuild.

## Global Constraints

- Pure modules (`bufFormatter.ts`) must NOT import `vscode`.
- Follow TDD: write unit tests first, verify failure, then write implementation.
- Conventional Commits: `feat: ...`, `test: ...`, `docs: ...`.
- Security: Always use `runProcess` (no shell execution), 5-second timeout, 10 MiB buffer cap.
- Strict Types: No unhandled promises, full ESLint compliance (`npm run verify`).

---

### Task 1: Create Pure Formatter Engine (`bufFormatter.ts`)

**Files:**
- Create: `src/formatting/bufFormatter.ts`
- Create: `src/test/unit/bufFormatter.test.ts`

**Interfaces:**
- Consumes: `runProcess` from `../platform/runProcess.js`
- Produces: `formatProtoText(input: FormatInput): Promise<FormatResult>`

- [ ] **Step 1: Write the failing unit tests for `bufFormatter`**

Create `src/test/unit/bufFormatter.test.ts`:
```typescript
import assert from "node:assert/strict";
import { formatProtoText, type FormatInput } from "../../formatting/bufFormatter.js";

describe("bufFormatter", () => {
  it("formats valid proto text via stdin successfully", async () => {
    const fakeRunProcess = async (
      _executable: string,
      args: string[],
      options?: { cwd?: string; stdin?: string }
    ) => {
      assert.deepEqual(args, ["format", "-"]);
      assert.equal(options?.stdin, "syntax=\"proto3\";\nmessage Book{string name=1;}");
      return {
        exitCode: 0,
        stdout: "syntax = \"proto3\";\n\nmessage Book {\n  string name = 1;\n}\n",
        stderr: ""
      };
    };

    const input: FormatInput = {
      text: "syntax=\"proto3\";\nmessage Book{string name=1;}",
      bufPath: "buf",
      cwd: "/workspace/root",
      runProcess: fakeRunProcess
    };

    const result = await formatProtoText(input);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.formattedText, "syntax = \"proto3\";\n\nmessage Book {\n  string name = 1;\n}\n");
    }
  });

  it("returns error result when buf returns non-zero exit code on syntax error", async () => {
    const fakeRunProcess = async () => ({
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
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.includes("syntax error"));
    }
  });
});
```

- [ ] **Step 2: Run unit tests to verify failure**

Run: `npm run test:unit`
Expected: FAIL with "Cannot find module '../../formatting/bufFormatter.js'"

- [ ] **Step 3: Implement `src/formatting/bufFormatter.ts`**

Create `src/formatting/bufFormatter.ts`:
```typescript
import { runProcess as defaultRunProcess } from "../platform/runProcess.js";

export interface FormatInput {
  text: string;
  bufPath: string;
  cwd: string;
  timeoutMs?: number;
  runProcess?: typeof defaultRunProcess;
}

export type FormatResult =
  | { success: true; formattedText: string }
  | { success: false; error: string };

export async function formatProtoText(input: FormatInput): Promise<FormatResult> {
  const runner = input.runProcess ?? defaultRunProcess;
  const timeoutMs = input.timeoutMs ?? 5000;

  try {
    const res = await runner(input.bufPath, ["format", "-"], {
      cwd: input.cwd,
      stdin: input.text,
      timeoutMs
    });

    if (res.exitCode !== 0) {
      const errorMsg = res.stderr.trim() || `buf format exited with code ${String(res.exitCode)}`;
      return { success: false, error: errorMsg };
    }

    return { success: true, formattedText: res.stdout };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}
```

- [ ] **Step 4: Run unit tests to verify pass**

Run: `npm run test:unit`
Expected: PASS (all unit tests pass)

- [ ] **Step 5: Commit Task 1**

```bash
git add src/formatting/bufFormatter.ts src/test/unit/bufFormatter.test.ts
git commit -m "feat: add pure buf format engine and unit tests"
```

---

### Task 2: Add Formatting Configuration & VS Code Formatting Provider

**Files:**
- Modify: `src/config/types.ts`
- Modify: `src/config/config.ts`
- Create: `src/formatting/formatProvider.ts`
- Create: `src/test/unit/formatProvider.test.ts`

**Interfaces:**
- Consumes: `formatProtoText` from `bufFormatter.ts`, `findBufRoot` from `../lsp/rootDiscovery.js`
- Produces: `BufFormattingProvider` implementing `vscode.DocumentFormattingEditProvider` and `vscode.DocumentRangeFormattingEditProvider`

- [ ] **Step 1: Add `formattingEnabled` configuration to `src/config/types.ts` & `src/config/config.ts`**

Update `src/config/types.ts`:
```typescript
export interface BufBearConfig {
  readonly lspEnabled: boolean;
  readonly bufPath: string;
  readonly traceServer: TraceServer;
  readonly missingBufNotification: boolean;
  readonly goEnabled: boolean;
  readonly goGenRoot: string;
  readonly goSourceRelative: boolean;
  readonly conflictWarningEnabled: boolean;
  readonly formattingEnabled: boolean;
}
```

Update `src/config/config.ts`:
```typescript
    formattingEnabled: config.get<boolean>("formatting.enabled", true),
```

- [ ] **Step 2: Write failing unit test for `BufFormattingProvider`**

Create `src/test/unit/formatProvider.test.ts`:
```typescript
import assert from "node:assert/strict";
import type * as vscode from "vscode";
import { BufFormattingProvider, type FormattingProviderDependencies } from "../../formatting/formatProvider.js";

describe("BufFormattingProvider", () => {
  it("returns TextEdit replacing full document when format succeeds", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => "syntax=\"proto3\";",
      lineCount: 1,
      lineAt: () => ({ range: { end: { character: 16 } } })
    } as unknown as vscode.TextDocument;

    const deps: FormattingProviderDependencies = {
      findRoot: async () => "/workspace",
      formatText: async () => ({ success: true, formattedText: "syntax = \"proto3\";\n" }),
      readConfig: async () => ({ formattingEnabled: true, bufPath: "buf" } as any),
      isTrusted: () => true,
      writeLog: () => {}
    };

    const provider = new BufFormattingProvider(deps);
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.ok(edits);
    assert.equal(edits.length, 1);
    assert.equal(edits[0]?.newText, "syntax = \"proto3\";\n");
  });

  it("returns empty edits silently when formatting is disabled in config", async () => {
    const document = {
      uri: { fsPath: "/workspace/api/v1/test.proto", scheme: "file" } as vscode.Uri,
      getText: () => "syntax=\"proto3\";"
    } as unknown as vscode.TextDocument;

    const deps: FormattingProviderDependencies = {
      findRoot: async () => "/workspace",
      formatText: async () => ({ success: true, formattedText: "syntax = \"proto3\";\n" }),
      readConfig: async () => ({ formattingEnabled: false, bufPath: "buf" } as any),
      isTrusted: () => true,
      writeLog: () => {}
    };

    const provider = new BufFormattingProvider(deps);
    const edits = await provider.provideDocumentFormattingEdits(document);

    assert.deepEqual(edits, []);
  });
});
```

- [ ] **Step 3: Run unit tests to verify failure**

Run: `npm run test:unit`
Expected: FAIL with "Cannot find module '../../formatting/formatProvider.js'"

- [ ] **Step 4: Implement `src/formatting/formatProvider.ts`**

Create `src/formatting/formatProvider.ts`:
```typescript
import * as path from "node:path";
import * as vscode from "vscode";
import { formatProtoText } from "./bufFormatter.js";
import { findBufRoot } from "../lsp/rootDiscovery.js";
import { readConfig } from "../config/config.js";
import type { Output } from "../platform/output.js";

export interface FormattingProviderDependencies {
  findRoot?: typeof findBufRoot;
  formatText?: typeof formatProtoText;
  readConfig?: typeof readConfig;
  isTrusted?: () => boolean;
  getWorkspaceFolder?: (uri: vscode.Uri) => string | undefined;
  writeLog?: (level: "info" | "warn" | "error", component: string, message: string, root?: string) => void;
}

export class BufFormattingProvider
  implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider
{
  readonly #deps: FormattingProviderDependencies;

  public constructor(deps: FormattingProviderDependencies = {}) {
    this.#deps = deps;
  }

  public async provideDocumentFormattingEdits(
    document: vscode.TextDocument
  ): Promise<vscode.TextEdit[]> {
    return this.formatDocument(document);
  }

  public async provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument
  ): Promise<vscode.TextEdit[]> {
    return this.formatDocument(document);
  }

  private async formatDocument(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    if (document.uri.scheme !== "file") {
      return [];
    }

    const isTrusted = this.#deps.isTrusted ? this.#deps.isTrusted() : vscode.workspace.isTrusted;
    if (!isTrusted) {
      return [];
    }

    const configReader = this.#deps.readConfig ?? readConfig;
    const config = await configReader(document.uri);
    if (!config.formattingEnabled) {
      return [];
    }

    const workspaceFolder = this.getWorkspaceFolder(document.uri);
    const finder = this.#deps.findRoot ?? findBufRoot;
    const bufRoot = await finder(document.uri.fsPath, workspaceFolder);
    const cwd = bufRoot ?? (workspaceFolder || path.dirname(document.uri.fsPath));

    const text = document.getText();
    const formatter = this.#deps.formatText ?? formatProtoText;
    const result = await formatter({
      text,
      bufPath: config.bufPath,
      cwd
    });

    if (!result.success) {
      this.log("warn", `Formatting failed for ${document.uri.fsPath}: ${result.error}`, cwd);
      return [];
    }

    if (result.formattedText === text) {
      return [];
    }

    const lastLineIndex = Math.max(0, document.lineCount - 1);
    const lastLine = document.lineAt(lastLineIndex);
    const fullRange = new vscode.Range(new vscode.Position(0, 0), lastLine.range.end);

    return [vscode.TextEdit.replace(fullRange, result.formattedText)];
  }

  private getWorkspaceFolder(uri: vscode.Uri): string | undefined {
    if (this.#deps.getWorkspaceFolder) {
      return this.#deps.getWorkspaceFolder(uri);
    }
    return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  }

  private log(level: "info" | "warn" | "error", message: string, root?: string): void {
    if (this.#deps.writeLog) {
      this.#deps.writeLog(level, "Formatter", message, root);
    }
  }
}
```

- [ ] **Step 5: Run unit tests to verify pass**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 6: Commit Task 2**

```bash
git add src/config/types.ts src/config/config.ts src/formatting/formatProvider.ts src/test/unit/formatProvider.test.ts
git commit -m "feat: add protobuf formatting provider and configuration"
```

---

### Task 3: Command Integration, Extension Wiring & Integration Tests

**Files:**
- Modify: `package.json`
- Modify: `src/ui/commands.ts`
- Modify: `src/extension.ts`
- Modify: `src/test/integration/suite/extension.test.ts`
- Create: `src/test/integration/suite/formatting.test.ts`

**Interfaces:**
- Consumes: `BufFormattingProvider`, `bufBear.formatDocument` command
- Produces: Formatter registration on extension activation and manual command handler with user-facing error notifications.

- [ ] **Step 1: Declare `bufBear.formatDocument` command & `bufBear.formatting.enabled` in `package.json`**

In `package.json`, add command under `contributes.commands`:
```json
{
  "command": "bufBear.formatDocument",
  "title": "BufBear: Format Document"
}
```
And add configuration under `contributes.configuration.properties`:
```json
"bufBear.formatting.enabled": {
  "type": "boolean",
  "default": true,
  "scope": "resource",
  "description": "Enable Protobuf document formatting using buf format."
}
```

- [ ] **Step 2: Add `bufBear.formatDocument` handler in `src/ui/commands.ts`**

Update `src/ui/commands.ts` to register `bufBear.formatDocument`:
```typescript
  context.subscriptions.push(
    vsc.commands.registerCommand("bufBear.formatDocument", async () => {
      const editor = vsc.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "proto3") {
        await vsc.window.showWarningMessage("Active editor is not a Protobuf file.");
        return;
      }

      const config = await readConfig(editor.document.uri);
      const bufRoot = await findBufRoot(editor.document.uri.fsPath, vsc.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath);
      const cwd = bufRoot ?? path.dirname(editor.document.uri.fsPath);

      const result = await formatProtoText({
        text: editor.document.getText(),
        bufPath: config.bufPath,
        cwd
      });

      if (!result.success) {
        await vsc.window.showErrorMessage(`BufBear Formatting Error: ${result.error}`);
        return;
      }

      if (result.formattedText === editor.document.getText()) {
        return;
      }

      const lastLine = editor.document.lineAt(Math.max(0, editor.document.lineCount - 1));
      const fullRange = new vsc.Range(new vsc.Position(0, 0), lastLine.range.end);
      await editor.edit((builder) => builder.replace(fullRange, result.formattedText));
    })
  );
```

- [ ] **Step 3: Register `BufFormattingProvider` in `src/extension.ts`**

In `src/extension.ts`, instantiate `BufFormattingProvider` and register formatting providers for `proto3`:
```typescript
  const formattingProvider = new BufFormattingProvider({
    writeLog: (level, component, message, root) => output.write(level, component, message, root)
  });

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider("proto3", formattingProvider),
    vscode.languages.registerDocumentRangeFormattingEditProvider("proto3", formattingProvider)
  );
```

- [ ] **Step 4: Create integration test `src/test/integration/suite/formatting.test.ts`**

Create `src/test/integration/suite/formatting.test.ts`:
```typescript
import assert from "node:assert/strict";
import * as path from "node:path";
import * as vscode from "vscode";

describe("Protobuf Formatting Integration Tests", () => {
  const workspacePath = path.resolve(__dirname, "../../../../src/test/fixtures/generated-go");
  const protoPath = path.join(workspacePath, "api/example/v1/example.proto");

  it("provides document formatting edits for proto3 files", async () => {
    const uri = vscode.Uri.file(protoPath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri
    );

    assert.ok(Array.isArray(edits));
  });
});
```

- [ ] **Step 5: Run full verification & integration tests**

Run: `npm run verify && npm run test:integration`
Expected: PASS (all 120+ unit tests and 11+ integration tests pass)

- [ ] **Step 6: Commit Task 3**

```bash
git add package.json package-lock.json src/ui/commands.ts src/extension.ts src/test/integration/suite/formatting.test.ts
git commit -m "feat: integrate buf format document formatting provider and command"
```
