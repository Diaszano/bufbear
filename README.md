# BufBear

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

---

## Prerequisites

- [VS Code](https://code.visualstudio.com/) v1.125.0 or newer.
- (Optional, recommended) [Buf CLI](https://buf.build/docs/installation) installed and available on your system `PATH` for full LSP diagnostic features.

---

## License

[MIT](LICENSE)
