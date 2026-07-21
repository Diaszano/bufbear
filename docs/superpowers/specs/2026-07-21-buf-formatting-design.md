# BufBear Protobuf Formatter Design Specification

## Overview

This specification details the design for integrating `buf format` into BufBear. The feature provides native VS Code document formatting, range formatting, and a manual `bufBear.formatDocument` command for `.proto` files using the `buf` CLI executable.

## Goals

1. Provide seamless integration with VS Code's native **Format Document** (`Shift+Alt+F`), **Format Selection**, and **Format on Save**.
2. Perform in-memory formatting via `stdin` (`buf format -`) so unsaved ("dirty") editor documents can be formatted non-destructively without modifying files on disk first.
3. Expose a dedicated manual command (`bufBear.formatDocument`) with clear user notifications.
4. Keep "Format on Save" silent and non-intrusive when syntax errors occur, while logging full diagnostics to the `BufBear` Output Channel.
5. Maintain strict security (no shell execution via `runProcess`) and high performance (< 50ms formatting latency for typical `.proto` files).

---

## Configuration

Add a new configuration section under `bufBear.formatting` in `package.json` and `src/config/types.ts`:

```json
"bufBear.formatting.enabled": {
  "type": "boolean",
  "default": true,
  "scope": "resource",
  "description": "Enable Protobuf document formatting using buf format."
}
```

---

## Architecture & Components

```
+-----------------------------------------------------------------------+
|                             VS Code Editor                            |
|    (Format Document / Format Range / Format on Save / Command)        |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------+-----------------------------------+
|               BufBear Formatting Extension Layer                      |
|                                                                       |
|  [src/formatting/formatProvider.ts]                                   |
|    - DocumentFormattingEditProvider                                   |
|    - DocumentRangeFormattingEditProvider                              |
|                                                                       |
|  [src/ui/commands.ts]                                                 |
|    - bufBear.formatDocument command                                   |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------+-----------------------------------+
|               Core Formatting Engine & Executor                       |
|                                                                       |
|  [src/formatting/bufFormatter.ts]                                     |
|    - Pure formatter service wrapping runProcess                       |
|    - Executes `buf format -` with stdio stdin/stdout                  |
|    - Computes minimal TextEdit replacement range                      |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------+-----------------------------------+
|                             buf CLI                                   |
|                  `buf format -` (stdin -> stdout)                     |
+-----------------------------------------------------------------------+
```

### 1. `src/formatting/bufFormatter.ts`
Pure formatting execution module (no direct `vscode` imports to maintain 100% unit-testability):
- `formatProtoText(input: FormatInput): Promise<FormatResult>`
  - `input`: `{ text: string, bufPath: string, cwd: string, timeoutMs?: number }`
  - Runs `runProcess(bufPath, ["format", "-"], { cwd, stdin: text, timeoutMs: 5000 })`.
  - Returns `{ success: true, formattedText: string }` or `{ success: false, error: string }`.

### 2. `src/formatting/formatProvider.ts`
VS Code provider class implementing:
- `vscode.DocumentFormattingEditProvider`
- `vscode.DocumentRangeFormattingEditProvider`

Behavior:
- Checks workspace trust (`isTrusted()`) and `bufBear.formatting.enabled`.
- Resolves the nearest Buf module root for `cwd` (via `findBufRoot`).
- Computes full document range `(0, 0)` to `(lastLine, lastCharacter)`.
- Invokes `formatProtoText`.
- On success: returns `[vscode.TextEdit.replace(fullRange, formattedText)]` (or empty list if unchanged).
- On error / syntax failure: returns `[]` silently and logs warning/error to `OutputChannel`.

### 3. `src/ui/commands.ts`
`bufBear.formatDocument` command handler:
- Obtains active text editor.
- Calls `formatProtoText`.
- On success: applies edit via `editor.edit(...)`.
- On syntax error or missing executable: displays `vscode.window.showWarningMessage` / `showErrorMessage` explaining the formatting failure.

### 4. `src/extension.ts`
On extension activation:
- Registers `vscode.languages.registerDocumentFormattingEditProvider("proto3", provider)`.
- Registers `vscode.languages.registerDocumentRangeFormattingEditProvider("proto3", provider)`.
- Registers `bufBear.formatDocument` command.

---

## Security & Reliability Constraints

1. **No Shell Execution**: Processes are executed directly via Node `child_process.execFile` (wrapped in `runProcess`).
2. **Execution Timeout**: 5-second timeout on `buf format -` to prevent hanging processes.
3. **Buffer Cap**: Output stdout capped at 10 MiB to prevent memory exhaustion on giant files.
4. **Workspace Trust**: Disables formatting execution if workspace is untrusted.

---

## Testing Plan

1. **Unit Tests (`src/test/unit/bufFormatter.test.ts`)**:
   - Verify `formatProtoText` builds correct CLI arguments `["format", "-"]`.
   - Verify stdio input/output text handling.
   - Verify handling of `buf` CLI returning non-zero exit codes on syntax errors.
   - Verify timeout and disabled configuration cases.

2. **Integration Tests (`src/test/integration/suite/formatting.test.ts`)**:
   - Test `vscode.commands.executeCommand("vscode.executeFormatDocumentProvider", uri)`.
   - Verify document text is formatted cleanly in VS Code Extension Host.
   - Test range formatting provider execution.
   - Test `bufBear.formatDocument` command execution.
