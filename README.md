# BufBear

<p align="center">
  <img src="resources/bufbear.png" width="128" alt="BufBear Logo" />
</p>

**BufBear** is a high-performance VS Code extension for Protocol Buffers (Protobuf), powered by [Buf](https://buf.build). It delivers seamless semantic IDE features via the official Buf Language Server and instant **Go to Implementation** navigation into source-relative generated Go code.

---

## Key Features

- **Protobuf Language Support**: Full syntax highlighting and language configuration for Protobuf (`proto3`).
- **Official Buf Language Server Integration**: Automatic linting, formatting, hover tooltips, document symbols, and definition navigation within `.proto` schemas.
- **Go to Implementation (Generated Go)**: Jump directly from Protobuf declarations (`message`, `enum`, `service`, `rpc`) to their generated Go types and interfaces in `.pb.go` and `_grpc.pb.go`.
- **Zero-Latency Navigation**: Pure TypeScript file mapping and line-by-line anchor parsing without full workspace indexing overhead.
- **Secure & Robust**: Built-in path traversal protection, symlink validation, 5 MiB file size limits, and bounded LRU caching.

---

## Navigation: Go to Definition vs. Go to Implementation

BufBear distinguishes between navigating within Protobuf schemas and navigating into generated code:

- **Go to Definition** (`F12` / `Ctrl+Click`): Supplied by the **Buf Language Server**. Navigates between `.proto` files (e.g., jumping from an imported message reference to its `.proto` definition).
- **Go to Implementation** (`Ctrl+F12` / `Cmd+F12`): Supplied by **BufBear**. Navigates from `.proto` declarations directly into **generated Go files**.

Buf CLI is required for the Buf Language Server and document-formatting integration. Generated-Go navigation can operate independently when a generated output tree is available, even if the Buf CLI is not installed.

### Generated Go Layout Example

BufBear maps source `.proto` files to source-relative generated Go outputs:

```text
api/book/v1/book.proto
├── gen/proto-go/api/book/v1/book.pb.go         # Messages & Enums
└── gen/proto-go/api/book/v1/book_grpc.pb.go    # Services & RPCs
```

For detailed mapping rules, supported AST anchors, `go_package` rationale, and troubleshooting, see [docs/generated-go-navigation.md](docs/generated-go-navigation.md).

---

## Commands

BufBear provides the following commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | ID | Description |
| :--- | :--- | :--- |
| **BufBear: Restart Language Server** | `bufBear.restartServer` | Restarts the Buf Language Server for the active workspace. |
| **BufBear: Show Output** | `bufBear.showOutput` | Opens the BufBear extension output log channel. |
| **BufBear: Check Health** | `bufBear.checkHealth` | Displays environment, CLI path, and LSP status diagnostics. |
| **BufBear: Open Settings** | `bufBear.openSettings` | Opens VS Code configuration filtered for BufBear settings. |
| **BufBear: Go to Generated Implementation** | `bufBear.goToGeneratedImplementation` | Explicitly triggers Go to Implementation navigation. |
| **BufBear: Format Document** | `bufBear.formatDocument` | Formats the active Protobuf document with `buf format`. |
| **BufBear: Show Quick Actions** | `bufBear.showQuickPick` | Opens a quick pick menu with the main BufBear actions (also bound to the status bar item). |

---

## Configuration Settings

Configure BufBear in your VS Code `settings.json`:

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `bufBear.lsp.enabled` | `boolean` | `true` | Enable the Buf Language Server for Protobuf language features. |
| `bufBear.buf.path` | `string` | `"buf"` | Path to the `buf` CLI executable. |
| `bufBear.buf.trace.server` | `enum` | `"off"` | Trace client-server communication (`off`, `messages`, `verbose`). |
| `bufBear.notifications.missingBuf` | `boolean` | `true` | Show actionable notification when `buf` CLI is not installed. |
| `bufBear.go.enabled` | `boolean` | `true` | Enable Go to Implementation navigation to generated Go files. |
| `bufBear.go.genRoot` | `string` | `"gen/proto-go"` | Generated Go root directory relative to the Buf root directory. |
| `bufBear.go.sourceRelative` | `boolean` | `true` | Map generated Go paths using source-relative file structure. |
| `bufBear.conflictWarning.enabled` | `boolean` | `true` | Warn when conflicting Protobuf extensions are active. |
| `bufBear.formatting.enabled` | `boolean` | `true` | Enable Protobuf document formatting with `buf format`. |

---

## Conflicts with other Protobuf extensions

BufBear is a full Protobuf language extension, so running it alongside another full Protobuf extension can produce duplicate diagnostics, hover tooltips, and competing formatters. BufBear detects the following extensions while they are active in your session:

| Extension | ID |
| :--- | :--- |
| Buf | `bufbuild.vscode-buf` |
| vscode-proto3 | `zxh404.vscode-proto3` |
| Protobuf Syntax Highlighting / Bazel | `sankethdev.vscode-proto` |

When one of them becomes active, BufBear shows a warning notification **once per VS Code session** offering three actions:

| Action | What it does |
| :--- | :--- |
| **Open Extensions** | Opens the VS Code *Enabled Extensions* view so you can disable or uninstall the conflicting extension. |
| **Disable BufBear LSP** | Keeps the other extension in charge and sets `bufBear.lsp.enabled` to `false` in your workspace settings, stopping BufBear's language server. |
| **Ignore** | Dismisses the warning for this session; both extensions keep running as-is. |

The conflict check re-runs automatically whenever the set of installed or enabled extensions changes (for example, after installing or disabling an extension), but the warning itself is still shown at most once per session. Set `bufBear.conflictWarning.enabled` to `false` to suppress these notifications entirely.

---

## Troubleshooting

### Status bar states

The BufBear status bar item reflects the current language server state:

| State | Meaning |
| :--- | :--- |
| **Starting** | The Buf Language Server is launching for the current workspace root. |
| **Ready** | The language server is up and all features are available. |
| **Degraded** | The Buf CLI was not found or does not support `lsp serve`. Generated-Go navigation may still work. |
| **Error** | The language server failed to start or crashed unexpectedly. |
| **Disabled / Stopped** | BufBear's LSP is disabled, or the workspace is not trusted (Restricted Mode). |

Hovering over the status bar item lists every managed workspace root with its individual state. The item only appears while editing `.proto`/proto3 documents or Buf configuration files.

### Buf CLI not found / status shows "Degraded"

BufBear probes the configured executable with `buf --version` and `buf lsp serve --help` (5 second timeout each). If either fails, the extension enters the **Degraded** state: semantic features and formatting are unavailable, while generated-Go navigation continues working on its own. To fix it:

1. Install the [Buf CLI](https://buf.build/docs/installation) (a version that includes `buf lsp serve` is required).
2. Verify the installation with `buf --version` in a terminal.
3. If `buf` lives outside your `PATH`, point `bufBear.buf.path` to its absolute path (or to any command name resolvable on the `PATH`).

Changes to `bufBear.buf.path`, `bufBear.lsp.enabled`, or `bufBear.buf.trace.server` restart the language clients automatically — no window reload needed.

### Reading logs

- Open **View → Output** (or run **BufBear: Show Output**) and select the **BufBear** channel for extension-level logs.
- Each workspace root gets its own **BufBear LSP — \<root\>** channel; enable `bufBear.buf.trace.server` (`messages` or `verbose`) to trace client↔server communication.

### Restarting manually

Run **BufBear: Restart Language Server** (`bufBear.restartServer`) from the Command Palette if the server appears stuck without changing any setting.

### Restricted Mode (untrusted workspace)

In untrusted workspaces BufBear never spawns the `buf` process or reads generated files: formatting and navigation stay disabled and the status bar shows **Disabled / Stopped**. Trust the workspace (**Workspaces: Manage Workspace Trust**) to enable features.

### Go to Implementation does not navigate to generated Go

Checklist, in order:

1. `bufBear.go.enabled` is `true`.
2. `bufBear.go.sourceRelative` is `true` (or the layout matches your mapping rules).
3. `bufBear.go.genRoot` points at the generated output root relative to the Buf root (default `gen/proto-go`).
4. The mapped directory actually contains generated files matching `*.pb.go` / `*_grpc.pb.go`.

Navigation caches are invalidated automatically whenever generated files are saved, created, deleted, or when Buf configuration files change — try saving the generated file if results look stale. See [docs/generated-go-navigation.md](docs/generated-go-navigation.md) for full mapping rules.

### Formatting fails

`buf format` requires syntactically valid Protobuf source. If the document has syntax errors, formatting is skipped and the failure is surfaced as a warning instead of silently corrupting the file. Fix the reported syntax error first, then format again. Ensure `bufBear.formatting.enabled` is `true` and the Buf CLI is installed.

---

## Privacy

BufBear runs **100% locally**:

- All processing happens on your machine; no data ever leaves it.
- No telemetry, analytics, or crash reporting of any kind.
- The extension itself performs no network access.
- `buf` processes are spawned only in trusted workspaces, and always with the working directory set inside your workspace.

---

## Prerequisites

- [VS Code](https://code.visualstudio.com/) v1.125.0 or newer.
- [Buf CLI](https://buf.build/docs/installation) installed and available on your system `PATH` for Buf Language Server features and document formatting.
- BufBear's generated-Go navigation works independently of the Buf CLI when the generated output tree is available.

---

## License

[MIT](LICENSE)
