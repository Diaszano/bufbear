# Generated Go Navigation in BufBear

BufBear provides **Go to Implementation** support from Protocol Buffer definitions (`.proto`) directly into their corresponding generated Go source files (`.pb.go` and `_grpc.pb.go`).

---

## Overview & Architecture

When editing `.proto` schemas, developers frequently need to inspect or jump to the generated Go code (structs, interfaces, and methods). BufBear implements high-performance, deterministic navigation from `.proto` AST declarations into generated Go artifacts without needing an external Go language server.

### Key Assumptions

1. **Source-Relative Generated Code**: BufBear assumes generated Go files follow a source-relative directory structure matching your `.proto` file layout.
2. **Default Generated Root**: The default generated directory root is `gen/proto-go`, resolved relative to the detected Buf module root (`buf.yaml` directory or workspace root).
3. **No Go Workspace Indexing**: Navigation operates strictly on source-relative file mapping and line-by-line anchor parsing, ensuring sub-millisecond response times without indexing the entire workspace.

---

## File & Symbol Mapping

BufBear maps `.proto` declarations to specific Go generated files based on symbol kind:

| Declaration Kind | Source File | Generated Target File | Go Anchor / Type |
| :--- | :--- | :--- | :--- |
| `message` | `foo/v1/bar.proto` | `gen/proto-go/foo/v1/bar.pb.go` | `type <MessageName> struct` |
| `enum` | `foo/v1/bar.proto` | `gen/proto-go/foo/v1/bar.pb.go` | `type <EnumName> int32` |
| `service` | `foo/v1/bar.proto` | `gen/proto-go/foo/v1/bar_grpc.pb.go` | `type <ServiceName>Server interface` |
| `rpc` | `foo/v1/bar.proto` | `gen/proto-go/foo/v1/bar_grpc.pb.go` | `<MethodName>(` within `<ServiceName>Server` interface |

### Exact Supported Anchors

- **Message**: Matches `type <MessageName> struct` in `.pb.go`.
- **Enum**: Matches `type <EnumName> int32` in `.pb.go`.
- **Service**: Matches `type <ServiceName>Server interface` in `_grpc.pb.go`.
- **RPC Method**: Matches `<RpcName>(` inside the server interface (`type <ServiceName>Server interface { ... }`) in `_grpc.pb.go`.

Comments and string literals inside generated Go files are automatically masked during anchor scanning to eliminate false positive matches.

---

## Settings & Configuration

Generated Go navigation can be customized via VS Code settings:

```json
{
  "bufBear.go.enabled": true,
  "bufBear.go.genRoot": "gen/proto-go",
  "bufBear.go.sourceRelative": true
}
```

### Configuration Options

- `bufBear.go.enabled` (`boolean`, default: `true`): Enable or disable Go to Implementation navigation into generated Go files.
- `bufBear.go.genRoot` (`string`, default: `"gen/proto-go"`): The relative directory path where generated Go files reside, relative to the Buf module root.
- `bufBear.go.sourceRelative` (`boolean`, default: `true`): When true, generated Go files are expected to mirror the `.proto` directory hierarchy.

---

## Why `go_package` is Not Used for File Mapping

Protobuf files often include a `go_package` option, such as:

```protobuf
option go_package = "github.com/example/repo/gen/foo/v1;foov1";
```

BufBear intentionally does **not** rely on `go_package` to locate generated files on the filesystem for the following reasons:

1. **Decoupling from Remote Import Paths**: `go_package` typically contains full Go module import paths (e.g., `github.com/...`). Translating remote import paths to local disk locations requires scanning `go.mod`, `GOPATH`, or vendor directories.
2. **Deterministic & Fast**: Source-relative code generation (`paths=source_relative` in `protoc-gen-go` / `buf.gen.yaml`) is the standard practice in modern Protobuf workflows. Mapping input paths to output paths directly is deterministic, instant, and requires no external tools or module resolution.
3. **Workspace Isolation & Safety**: Path traversal attacks or symlink escapes outside the workspace boundaries are safely prevented by sticking to strict relative workspace containment rules.

---

## Performance & File Limits

- **5 MiB File Limit**: Generated Go files exceeding **5 MiB** (5,242,880 bytes) are skipped to preserve extension responsiveness and prevent memory spikes.
- **Bounded LRU Cache**: Up to 256 scanned file AST locations are cached in memory. Cache entries are automatically invalidated when file modification timestamps (`mtime`) change.
- **Cancellation Aware**: Rapid navigation requests or cursor movements cancel ongoing background scans immediately.
- **Silent Fallback**: If a generated file does not exist on disk or symbol anchor is not found, the LSP implementation provider silently returns no results. The explicit command `BufBear: Go to Generated Implementation` displays user notifications explaining why navigation could not be completed.

---

## Troubleshooting Checklist

If **Go to Implementation** is not opening your generated Go files, check the following:

1. **Has `buf generate` or `protoc` been executed?**
   - Ensure the generated Go files (`.pb.go` / `_grpc.pb.go`) exist on disk.
2. **Is your generated output root custom?**
   - If your generated files are placed in `gen/go` instead of `gen/proto-go`, set `"bufBear.go.genRoot": "gen/go"` in your VS Code settings.
3. **Are generated files using `source_relative` paths?**
   - Verify that your `buf.gen.yaml` or `protoc` invocation uses `opt: paths=source_relative`.
4. **Is the generated file too large?**
   - Files larger than 5 MiB are skipped for performance reasons.
5. **Is `bufBear.go.enabled` enabled?**
   - Check that `"bufBear.go.enabled": true` is set in your user or workspace settings.
