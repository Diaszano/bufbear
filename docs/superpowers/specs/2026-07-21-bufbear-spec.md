# BufBear — Product and Technical Specification

> **Status:** Ready for implementation planning  
> **Date:** 2026-07-21  
> **Owner:** Diaszano  
> **Repository:** `Diaszano/bufbear`  
> **License:** MIT  
> **Upstream inspiration:** the public MIT-licensed `sanketh-nm/vscode-proto` project

## Product identity

| Item | Canonical value |
|---|---|
| Product name | **BufBear** |
| Repository | `Diaszano/bufbear` |
| Package name | `bufbear` |
| Marketplace display name | `BufBear` |
| Publisher | `diaszano` |
| Extension ID | `diaszano.bufbear` |
| Configuration namespace | `bufBear.*` |
| Command prefix | `BufBear:` |
| Output channel | `BufBear` |
| Tagline | **Navigate your Protobuf jungle.** |
| Marketplace description | **Advanced Protocol Buffers support for VS Code, powered by Buf.** |

The visual identity should use an original, friendly bear mascot carrying or inspecting a `.proto` file. The preferred palette is purple, blue, and yellow. The icon must remain recognizable at VS Code Marketplace and activity-bar sizes and must not reuse third-party icon artwork.

## 1. Executive decision

BufBear will be a new, independent VS Code extension rather than a long-lived fork.

The extension will not maintain a custom Protobuf parser for features already provided by the Buf Language Server. It will launch `buf lsp serve` through the standard VS Code language-client library and add a small set of VS Code-native capabilities that Buf does not provide, starting with navigation from a Protobuf declaration to generated Go code.

This design intentionally replaces the earlier regex-heavy and direct `buf lint`/`buf format` approach. In 2026, Buf exposes a production Language Server with semantic diagnostics, formatting, definition, references, completion, hover, symbols, and code actions. Duplicating those features inside the extension would increase maintenance cost and produce semantic drift.

## 2. Product statement

**BufBear makes Protobuf a first-class language in VS Code while remaining small, predictable, secure, and easy to maintain.**

The extension combines:

1. syntax highlighting and language configuration that work immediately;
2. semantic language features supplied by the locally installed Buf Language Server;
3. generated-code navigation supplied by BufBear;
4. clear health, restart, and troubleshooting commands;
5. deterministic packaging, tests, and release automation.

## 3. Users and primary workflows

### 3.1 Primary users

Developers who edit `.proto` files in local, Remote SSH, WSL, or Dev Container workspaces and use Buf as their Protobuf toolchain.

### 3.2 Core workflows

- Open a `.proto` file and receive diagnostics without manually running a command.
- Format a document using the same semantic formatter used by the Buf toolchain.
- Navigate to imported files, types, services, methods, fields, and references.
- Use hover, completion, workspace symbols, and Buf code actions.
- Select **Go to Implementation** on a `message`, `enum`, `service`, or `rpc` declaration and open the matching generated Go symbol.
- Inspect extension and language-server logs.
- Restart the server after changing Buf configuration or dependencies.
- Understand immediately when Buf is missing, incompatible, or shadowed by another Protobuf extension.

## 4. Goals

### G1 — LSP-first semantic support

Use `buf lsp serve` as the source of truth for Protobuf semantics. BufBear must not independently reimplement definition, references, completion, hover, document symbols, formatting, or semantic diagnostics.

### G2 — Generated-code navigation

Provide reliable navigation from Protobuf declarations to generated Go files produced with source-relative paths.

### G3 — Cross-platform behavior

Support current VS Code desktop extension hosts on Windows, macOS, and Linux, including Remote SSH, WSL, and Dev Containers.

### G4 — Operational clarity

Expose a status bar item, output channel, health check, restart command, and actionable error messages.

### G5 — Maintainable architecture

Keep VS Code glue thin, isolate process and mapping logic behind interfaces, use cancellation-aware asynchronous APIs, and cover pure logic with fast unit tests.

### G6 — Safe by default

Never invoke a shell, never interpolate user-controlled values into command strings, never download executables automatically, and never collect telemetry.

## 5. Non-goals for v1

| Not included | Reason | Revisit condition |
|---|---|---|
| Bundling or downloading Buf | Supply-chain and platform complexity | A signed, checksummed installer is designed |
| A custom Protobuf parser or AST | Buf LSP already owns semantics | Only if a required capability is absent |
| Web-only hosts such as `vscode.dev` | Browser extensions cannot spawn a local Buf process | A remote LSP transport is designed |
| `buf breaking` in the editor | Requires a baseline and can be noisy | A dedicated opt-in workflow is requested |
| Code generation commands | Existing repositories differ widely | A generic task integration is designed |
| Generated TypeScript/C#/Java navigation | Generator conventions vary | Individual adapters are specified and tested |
| Rename or references implemented by BufBear | Already provided by Buf LSP | Never while Buf provides them |
| Telemetry | Unnecessary for the product | Only after an explicit privacy design |

## 6. Compatibility baseline

- VS Code engine: `^1.125.0`.
- Development runtime: Node.js 22 or newer.
- TypeScript: `^7.0.2`.
- `vscode-languageclient`: `^10.1.0`.
- esbuild: `^0.28.1`.
- Buf compatibility is capability-based, not version-string-based:
  - `buf --version` must execute successfully;
  - `buf lsp serve --help` must execute successfully.
- The extension runs in a Node extension host. It is not declared as a web extension in v1.

These are implementation baselines, not promises to support every future version indefinitely. Dependabot and CI keep the lockfile current while the declared VS Code engine remains stable for the v1 line.

## 7. Functional requirements

### FR-1 Language registration and baseline editing

- Register `.proto` files with language id `proto3`.
- Contribute a TextMate grammar and a declarative `language-configuration.json`.
- Support line/block comments, brackets, auto-closing pairs, surrounding pairs, word boundaries, and indentation.
- Syntax highlighting must remain available when Buf is unavailable.

### FR-2 Buf executable resolution

Resolution order:

1. workspace/resource setting `bufBear.buf.path`;
2. `buf` found through the extension-host `PATH`.

Rules:

- The configured value is an executable path or executable name, never a shell command.
- Execution uses `child_process.spawn` or `execFile` with `shell: false`.
- The health probe has a five-second timeout.
- Missing or incompatible Buf produces one actionable notification per workspace session, not repeated notifications on every document change.
- The output channel records the attempted executable and exit metadata without environment variables or secrets.

### FR-3 Workspace discovery

- Detect Buf roots by walking upward from a `.proto` file for `buf.yaml`.
- Fall back to the containing VS Code workspace folder when no marker exists.
- Do not walk above the workspace boundary unless the file is opened outside a workspace.
- Support multiple workspace folders.
- Maintain one `LanguageClient` per effective workspace root to isolate Buf configuration, dependencies, and process failures.
- Stop a client when its workspace folder is removed or the extension is deactivated.

### FR-4 Language-server lifecycle

- Start the server as `buf lsp serve` over stdio.
- Use `vscode-languageclient/node`.
- Synchronize `.proto`, `buf.yaml`, `buf.gen.yaml`, `buf.lock`, and related Buf configuration files.
- Restart the affected client when:
  - `bufBear.buf.path` changes;
  - a Buf root marker is created, deleted, or renamed;
  - the user executes `BufBear: Restart Language Server`.
- Implement bounded restart backoff: immediate first retry, then 1s, 3s, and 10s; stop automatic retries after four failures in five minutes.
- A manual restart resets the failure counter.
- Deactivation waits for every client to stop but does not block indefinitely.

### FR-5 Language-server status and commands

Status states:

- `starting`
- `ready`
- `degraded`
- `stopped`
- `error`

Commands:

- `bufBear.restartServer`
- `bufBear.showOutput`
- `bufBear.checkHealth`
- `bufBear.openSettings`
- `bufBear.goToGeneratedImplementation`

The status bar item:

- is visible only while a Protobuf or Buf configuration file is active;
- shows the state and active root;
- opens a quick pick with health, restart, logs, and settings actions;
- never displays a raw stack trace.

### FR-6 Conflict detection

- Detect known extensions that also register full Protobuf language support, including the official Buf extension.
- Show a one-time warning when a likely provider conflict is active.
- Offer actions to open the Extensions view or disable BufBear LSP through `bufBear.lsp.enabled`.
- Syntax highlighting and generated-code navigation may remain enabled when BufBear LSP is disabled.

### FR-7 Generated Go implementation navigation

Supported declarations:

- `message`
- `enum`
- `service`
- `rpc`

Default mapping for a source file `<moduleRoot>/<relative>/<name>.proto`:

| Protobuf declaration | Generated file | Anchor |
|---|---|---|
| message | `<go.genRoot>/<relative>/<name>.pb.go` | `type <Name> struct` |
| enum | `<go.genRoot>/<relative>/<name>.pb.go` | `type <Name> int32` |
| service | `<go.genRoot>/<relative>/<name>_grpc.pb.go` | `type <Name>Server interface` |
| rpc | `<go.genRoot>/<relative>/<name>_grpc.pb.go` | method `<Name>(` inside the server interface |

Configuration:

- `bufBear.go.enabled`: boolean, default `true`.
- `bufBear.go.genRoot`: string, default `gen/proto-go`.
- `bufBear.go.sourceRelative`: boolean, default `true`.

Rules:

- Resolve `go.genRoot` relative to the detected Buf root.
- Reject paths that escape the workspace root after normalization.
- Only provide a result when the cursor is on a declaration name.
- Prefer exact token and declaration matches over substring matches.
- Respect cancellation before filesystem reads and between scan chunks.
- A missing generated file or anchor is a normal no-result condition.
- The command variant may show an actionable message; the provider itself remains silent.

### FR-8 Caching and invalidation

- Cache Buf-root discovery by directory.
- Cache generated-file line indexes by URI, mtime, and size.
- Invalidate a generated-file cache entry when the file changes, is created, or is deleted.
- Bound caches:
  - root cache: 512 directories;
  - generated-file index cache: 256 files.
- Use least-recently-used eviction.
- Do not cache failed process probes longer than 30 seconds.

### FR-9 Configuration

Configuration namespace: `bufBear.*`.

| Setting | Type | Default |
|---|---:|---:|
| `lsp.enabled` | boolean | `true` |
| `buf.path` | string | `"buf"` |
| `buf.trace.server` | enum `off/messages/verbose` | `"off"` |
| `notifications.missingBuf` | boolean | `true` |
| `go.enabled` | boolean | `true` |
| `go.genRoot` | string | `"gen/proto-go"` |
| `go.sourceRelative` | boolean | `true` |
| `conflictWarning.enabled` | boolean | `true` |

All settings that can differ across workspace folders use resource scope.

### FR-10 Logging

- Create one output channel named `BufBear`.
- Prefix lines with ISO timestamp, severity, root label, and component.
- Debug protocol tracing is delegated to the language client and controlled by `bufBear.buf.trace.server`.
- Do not log:
  - full environment blocks;
  - file contents;
  - tokens, credentials, registry auth, or command-line secrets.
- When logging paths, prefer workspace-relative paths.

### FR-11 Packaging and distribution

- Bundle the extension into `dist/extension.js` with esbuild.
- Run TypeScript type checking separately with `tsc --noEmit`.
- Exclude source, tests, local fixtures, and development dependencies from the VSIX.
- Include:
  - `dist/extension.js`;
  - grammar and language configuration;
  - icon;
  - README, CHANGELOG, LICENSE, and THIRD_PARTY_NOTICES.
- `npm run package:vsix` creates a deterministic `bufbear-<version>.vsix`.

## 8. Architecture

### 8.1 Component map

```text
src/
├── extension.ts
├── config/
│   ├── config.ts
│   └── types.ts
├── lsp/
│   ├── bufExecutable.ts
│   ├── clientFactory.ts
│   ├── clientManager.ts
│   ├── rootDiscovery.ts
│   └── serverState.ts
├── navigation/
│   └── go/
│       ├── declaration.ts
│       ├── fileMapping.ts
│       ├── goIndex.ts
│       └── implementationProvider.ts
├── platform/
│   ├── boundedCache.ts
│   ├── processRunner.ts
│   └── output.ts
├── ui/
│   ├── commands.ts
│   ├── conflictDetector.ts
│   └── statusBar.ts
└── test/
    ├── unit/
    ├── integration/
    └── fixtures/
```

### 8.2 Dependency direction

```text
VS Code activation/UI
        ↓
client manager / implementation provider
        ↓
pure mapping, process, cache, and declaration modules
```

Pure modules must not import `vscode`. VS Code adapters convert `Uri`, `Position`, configuration, cancellation, and UI messages at the boundary.

### 8.3 Why LSP-first

The language server is the only component that understands complete Protobuf semantics. BufBear should not maintain a second parser for imports, nested declarations, editions, options, or Buf-managed dependencies.

A lightweight declaration recognizer is permitted only for generated-code navigation because it answers a narrow question: “Is the cursor on the name of a supported top-level declaration, and what is its name and kind?” It is not a semantic parser and must not be used for language features already supplied by Buf.

## 9. Public interfaces

```ts
export interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
}

export interface BufProbe {
  readonly executable: string;
  readonly version: string;
  readonly supportsLsp: boolean;
}

export interface RootDiscovery {
  findForFile(filePath: string, workspaceBoundary?: string): Promise<string | undefined>;
  invalidate(directory?: string): void;
}

export interface ManagedClient {
  readonly root: string;
  readonly state: ServerState;
  start(): Promise<void>;
  restart(reason: string): Promise<void>;
  stop(): Promise<void>;
}

export type ProtoDeclarationKind = "message" | "enum" | "service" | "rpc";

export interface ProtoDeclaration {
  readonly kind: ProtoDeclarationKind;
  readonly name: string;
  readonly line: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
  readonly parentService?: string;
}

export interface GoTarget {
  readonly filePath: string;
  readonly symbolName: string;
  readonly kind: ProtoDeclarationKind;
  readonly parentService?: string;
}
```

## 10. Error handling

### Expected, silent no-result cases

- Cursor is not on a supported declaration.
- Generated Go is disabled.
- No Buf root is found for generated-code mapping.
- Generated file does not exist.
- Exact Go anchor is absent.
- Request is cancelled.

### User-visible degraded cases

- Buf executable is missing.
- `buf lsp serve` is unsupported.
- Server repeatedly exits.
- Configuration points outside the workspace.
- Another full Protobuf extension is likely conflicting.

Every user-visible error includes:

1. a concise cause;
2. one recommended action;
3. a button for logs or settings where appropriate.

## 11. Security and privacy requirements

- Use `spawn`/`execFile` with argument arrays and `shell: false`.
- Validate executable configuration as a single path/name; reject newlines and NUL characters.
- Normalize all configured paths.
- Reject generated roots that escape the workspace.
- Do not automatically download or execute repository-local binaries.
- Respect VS Code Workspace Trust:
  - syntax support is always available;
  - spawning Buf and reading generated files are disabled in untrusted workspaces;
  - status explains the restricted state.
- No telemetry, analytics, crash upload, or network request is implemented.
- Preserve upstream MIT notices for any copied grammar, icon, or code.

## 12. Performance budgets

Measured on a warm extension host with a medium workspace:

| Operation | Budget |
|---|---:|
| Extension activation excluding Buf process startup | p95 < 75 ms |
| Buf executable probe | timeout 5 s |
| Root lookup, cached | p95 < 1 ms |
| Generated target mapping | p95 < 5 ms |
| Generated Go anchor lookup, cached | p95 < 10 ms |
| Generated Go anchor lookup, uncached file ≤ 5 MB | p95 < 80 ms |
| VSIX size | < 2 MB excluding images |

The extension must never scan the entire workspace to answer one implementation request.

## 13. Testing strategy

### Unit tests

- executable validation and probe result parsing;
- bounded LRU behavior;
- root discovery and workspace boundary handling;
- declaration recognition;
- source-relative Go file mapping;
- path escape rejection;
- exact Go anchor indexing;
- restart backoff state machine.

### Integration tests

Run in VS Code Extension Host with fixtures:

- activation and language registration;
- missing Buf state;
- fake Buf process handshake/lifecycle;
- one client per root in a multi-root workspace;
- configuration change restart;
- status and commands;
- implementation navigation for message, enum, service, and rpc;
- untrusted-workspace restrictions where test APIs permit.

### Manual matrix

- Windows x64;
- macOS arm64;
- Ubuntu x64;
- Remote SSH or Dev Container;
- single-root and multi-root;
- Buf present and missing;
- official Buf extension enabled and disabled.

## 14. Acceptance criteria

### AC-1 Build and package

`npm ci && npm run verify && npm run package:vsix` succeeds on Windows, macOS, and Linux CI.

### AC-2 Baseline support

Opening a `.proto` file provides syntax highlighting even when Buf is missing.

### AC-3 LSP capability

With a compatible Buf executable, the output channel reports a ready client and semantic diagnostics, definition, references, completion, hover, formatting, symbols, and code actions are available through the language server.

### AC-4 Multi-root isolation

Two workspace folders with separate `buf.yaml` files start separate clients; restarting one does not stop the other.

### AC-5 Failure containment

A server crash changes only the affected root to `error`/`degraded`, applies bounded retries, and does not crash the extension host.

### AC-6 Generated Go navigation

Go to Implementation on a fixture declaration opens the exact generated Go symbol for message, enum, service, and rpc.

### AC-7 Cancellation

Cancelling a generated-code lookup before or during file indexing returns no result and produces no notification.

### AC-8 Security

Tests prove shell execution is disabled, path traversal is rejected, and untrusted workspaces do not start Buf.

### AC-9 Conflict warning

When another known full Protobuf provider is active, one warning appears with actionable choices and does not repeat in the session.

### AC-10 Documentation and legal notices

README explains installation, Buf requirements, settings, commands, conflicts, troubleshooting, privacy, and generated Go assumptions. LICENSE and THIRD_PARTY_NOTICES are packaged.

## 15. Migration from the public upstream project

BufBear is not required to preserve upstream implementation details.

Retained product ideas:

- `.proto` language registration;
- syntax highlighting;
- fast navigation-oriented workflow;
- a small extension surface.

Replaced implementation choices:

- direct `protoc` invocation;
- hardcoded temporary paths;
- parsing diagnostics from compiler stderr;
- regex-based cross-file semantic definition;
- firing compilation on every text change;
- deprecated VS Code APIs;
- unbundled extension output.

Any copied MIT-licensed assets must retain their notice. New TypeScript implementation should be independently written against the behavior and contracts in this specification.

## 16. Release scope

### v0.1.0

- independent extension scaffold;
- grammar and language configuration;
- Buf executable health check;
- one LSP client per root;
- lifecycle, logging, status, restart, conflict warning;
- generated Go implementation navigation;
- tests, CI, VSIX packaging, README, notices.

### Future candidates

- generated TypeScript adapter;
- generated C# adapter;
- opt-in Buf installation manager with signature verification;
- configurable code-generation tasks;
- web client backed by a remote language server;
- performance telemetry that is strictly local and user-visible.

## 17. References

- Public upstream: `https://github.com/sanketh-nm/vscode-proto`
- Buf editor/LSP integration: `https://buf.build/docs/cli/editors-lsp/`
- Buf LSP command: `https://buf.build/docs/reference/cli/buf/lsp/serve/`
- VS Code language-server guide: `https://code.visualstudio.com/api/language-extensions/language-server-extension-guide`
- VS Code extension bundling: `https://code.visualstudio.com/api/working-with-extensions/bundling-extension`
