# BufBear Delivery, Quality, and Node LTS Design

## Goal

Make BufBear reproducible on Node 24 LTS, reliable to test and package, and governed by a CI/CD and GitHub workflow adapted from Watchman without inheriting its container-specific infrastructure.

## Scope

This work covers the failures and delivery gaps identified in the project review:

- the missing `check-types` script used by CI;
- Node-version drift between local development and GitHub Actions;
- nondeterministic subprocess tests on Node 24;
- formatting integration that passes without verifying a real format operation;
- stale Buf-root discovery after `buf.yaml` changes;
- oversized VSIX files containing development-only material;
- release/version documentation drift; and
- repository governance automation.

It does not add Docker images, container scans, or Docker Hub/GHCR publishing. Those Watchman concerns do not apply to a VS Code extension.

## Node Runtime Contract

Node 24 is the supported LTS line. The repository will declare it in `.nvmrc`, in `package.json` through `engines.node`, and in every GitHub Actions setup step. The version contract will use Node 24, not a machine-specific Node or npm path.

The script API will be explicit and CI-compatible:

- `check-types` runs the existing TypeScript no-emit check;
- `verify` runs linting, type checking, and unit tests;
- `test:integration` remains the VS Code extension-host suite;
- `test:release` validates release and workflow contracts; and
- `test:package` validates the generated VSIX manifest, contents, and size budget.

## CI/CD Design

BufBear will borrow Watchman’s delivery principles:

- pin third-party GitHub Actions to reviewed commit SHAs with version comments;
- use `npm ci`, Node 24, npm caching, least-privilege job permissions, timeouts, and workflow concurrency;
- run independent commitlint, lint/typecheck, unit/integration, release-config, and package jobs in parallel;
- add an aggregate `quality` job that depends on those gates and is suitable for branch protection;
- make the release job depend on the aggregate gate; and
- test the workflow configuration instead of relying on manual inspection.

The release architecture remains semantic-release plus VSIX upload to the VS Code Marketplace. It retains stable-tag snapshotting to discover the exact VSIX version. The workflow will fail when semantic-release fails rather than continue into an ambiguous state without a published tag.

## Extension Quality Design

### Subprocess tests

The process-runner tests will use a fixture command whose writes are deterministic under Node 24, or explicitly await stream completion. They will no longer rely on a short `node -e` process flushing a pipe during shutdown. The production process-runner behavior stays unchanged unless the new regression test proves a production defect.

### Formatting integration

The integration environment will install a pinned Buf CLI release. The formatting scenario will start with deliberately unformatted valid Protobuf, execute the document-format provider, and assert the concrete edit/result. A missing formatter or an undefined result is a test failure, not a pass.

### Buf-root cache invalidation

The extension will watch Buf workspace files (`buf.yaml`, `buf.lock`, `buf.gen.yaml`, and `buf.work.yaml`) and call `invalidateRootCache()` when they change. The watcher lifecycle will follow the existing generated-Go watcher lifecycle. Tests will cover creation, update, deletion, and cache refresh.

## VSIX Delivery Design

The extension package will use an explicit publishing allowlist through the `files` field in `package.json`, with the VSIX content verified after packaging. The package contains only runtime artifacts and public extension assets: `dist`, `resources`, `syntaxes`, `language-configuration.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, and `THIRD_PARTY_NOTICES.md`.

Development-only files are excluded, including `.codex`, `.husky`, `.github`, `docs/superpowers`, test sources, build configuration, release scripts, and the root `logo.png`. The duplicate root logo is removed from version control after confirming `resources/bufbear.png` is the referenced extension icon. The VSIX test enforces this allowlist and a documented size budget.

## Documentation and Release Hygiene

The README command table and settings table will include the formatting command and `bufBear.formatting.enabled`. Release metadata will have one source of truth: semantic-release determines release versions, and the committed package version, lockfile root version, changelog, and Git tags remain consistent. Tests will detect a package/lockfile version mismatch.

## GitHub Governance

The repository will adopt the applicable Watchman governance patterns:

- `CODEOWNERS` names the repository owner for all paths and `.github` configuration;
- Dependabot checks npm and GitHub Actions weekly, targets `dev`, groups minor/patch updates, and uses conventional commit prefixes;
- a PR template captures change type, verification, extension-package checks, documentation, and issue links;
- bug and feature issue forms request VS Code, operating system, Buf, extension version, repro steps, and expected/actual behavior; and
- issue configuration routes security reports to GitHub Security Advisories.

## Verification Criteria

The implementation is complete when all of the following are true on Node 24:

1. `npm ci`, `npm run lint`, `npm run check-types`, `npm run test:unit`, `npm run test:integration`, `npm run test:release`, and `npm run test:package` pass.
2. The CI workflow uses only Node 24 and pinned third-party action SHAs.
3. The aggregate quality job blocks releases when any quality job fails.
4. Formatting integration proves an actual Buf formatting result.
5. Updating Buf workspace metadata invalidates root discovery immediately.
6. The VSIX contains only the approved public runtime assets and stays within its enforced size budget.
7. GitHub governance files are present and target the `dev` branch where applicable.
