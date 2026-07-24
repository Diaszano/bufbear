# Changelog

All notable changes to the **BufBear** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-21

### Added
- Added Go to Implementation for Protobuf messages, enums, services, and RPCs.
- Added source-relative generated Go mapping with configurable root (`bufBear.go.genRoot`).
- Added bounded indexing cache, cancellation, filesystem invalidation, and path traversal protection.
- Added official Buf Language Server (LSP) integration for linting, formatting, hover tooltips, and schema definition navigation.
- Added extension commands: `bufBear.restartServer`, `bufBear.showOutput`, `bufBear.checkHealth`, `bufBear.openSettings`, and `bufBear.goToGeneratedImplementation`.
- Added the `bufBear.formatDocument` command and `bufBear.formatting.enabled` setting.
- Added status bar indicator showing Buf LSP health and workspace status.
- Added conflict detection for overlapping Protobuf VS Code extensions.
