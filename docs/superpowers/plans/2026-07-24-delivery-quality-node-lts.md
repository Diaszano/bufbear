# BufBear Delivery, Quality, and Node LTS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BufBear reproducible on Node 24 LTS, repair the failing quality gates, harden integration and packaging checks, and adopt the relevant CI/CD and GitHub governance patterns from `../watchman`.

**Architecture:** Keep the extension runtime architecture unchanged and improve its delivery boundaries: a single Node 24 contract, deterministic process and integration tests, explicit VSIX contents, and independent CI jobs joined by a required aggregate quality job. Adapt Watchman’s pinned-action, least-privilege, release-snapshot, Dependabot, CODEOWNERS, and issue/PR-template patterns while excluding Docker-specific jobs.

**Tech Stack:** Node.js 24 LTS, npm lockfile v3, TypeScript, ESLint, Mocha, `@vscode/test-electron`, Buf CLI, `@vscode/vsce`, GitHub Actions, semantic-release, Dependabot, and GitHub issue forms.

## Global Constraints

- Node 24 is the only supported Node line; every workflow setup step uses `node-version: 24`.
- `npm ci` is the installation command in CI; the committed `package-lock.json` must remain synchronized with `package.json`.
- The extension remains a VS Code extension; do not add Docker, container publishing, or container scanning jobs.
- Third-party GitHub Actions use reviewed commit SHAs with version comments, following Watchman’s current pins.
- Existing user changes in `package.json`, `.codex/`, `.vscode/settings.json`, and the existing lint plan are not overwritten or included in unrelated commits.
- Every task ends with its focused test command and a Conventional Commit.

---

## File Map

| File | Responsibility in this plan |
| --- | --- |
| `.nvmrc` | Local Node 24 selection. |
| `package.json` / `package-lock.json` | Node engine, stable script names, package allowlist, and synchronized metadata. |
| `src/test/unit/processRunner.test.ts` / `src/test/unit/runProcess.test.ts` | Node-24-safe subprocess regression coverage. |
| `scripts/test-package-config.mjs` | Machine-checkable VSIX contents and size budget (created in Task 5). |
| `scripts/test-release-config.mjs` | CI/release contract assertions, including Node/action/job gates. |
| `src/lsp/rootDiscovery.ts` / `src/extension.ts` | Buf-root cache invalidation API and workspace metadata watchers. |
| `src/test/unit/rootDiscovery.test.ts` / `src/test/integration/suite/formatting.test.ts` | Root invalidation and real formatting behavior tests. |
| `src/test/fixtures/formatting/**` | Deliberately unformatted valid Protobuf fixture and expected output. |
| `.github/workflows/ci.yml` / `.github/workflows/pr-title.yml` / `.github/workflows/release.yml` | Node 24, pinned actions, parallel gates, aggregator, and release behavior. |
| `.github/scripts/resolve-release-tag.sh` / `.github/scripts/validate-commits.sh` | Reused release and commit validation helpers. |
| `.vscodeignore` / `logo.png` | Public VSIX boundary and duplicate asset removal. |
| `README.md` / `CHANGELOG.md` | User-facing commands, settings, and release history. |
| `.github/CODEOWNERS` / `.github/dependabot.yml` / `.github/pull_request_template.md` | Repository ownership, dependency updates, and review checklist. |
| `.github/ISSUE_TEMPLATE/config.yml` / `.github/ISSUE_TEMPLATE/bug_report.yml` / `.github/ISSUE_TEMPLATE/feature_request.yml` | Issue intake and private security-report routing. |

## Task 1: Establish the Node 24 and npm script contract

**Files:**

- Create: `.nvmrc`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `scripts/test-release-config.mjs`

**Interfaces:**

- Produces `npm run check-types`, which is the command used by CI and maps to `tsc -p tsconfig.json --noEmit`.
- Produces `npm run verify`, which runs `lint`, `check-types`, and `test:unit`.
- Task 5 adds `npm run test:package`, which invokes the package-content verifier.

- [ ] **Step 1: Add the failing contract assertions.** Extend `scripts/test-release-config.mjs` to assert that `package.json.engines.node` is the exact Node 24 range selected by the implementation, `.nvmrc` contains `24`, and the scripts `check-types` and `verify` exist. Run `npm run test:release`; it must fail against the current package because `engines.node`, `.nvmrc`, and `check-types` are absent.

- [ ] **Step 2: Add the Node and script metadata.** Create `.nvmrc` containing `24`. Add `"node": ">=24 <25"` under `engines`. Define scripts with this behavior:

  ```json
  "check-types": "tsc -p tsconfig.json --noEmit",
  "verify": "npm run lint && npm run check-types && npm run test:unit",
  ```

  Keep the existing `check` alias for compatibility, and make `vscode:prepublish` use `check-types` so CI and packaging share the same type-check contract.

- [ ] **Step 3: Synchronize the lockfile.** Run `npm install --package-lock-only` under Node 24 and verify that the root package entry has the same version, dependencies, devDependencies, and engine metadata as `package.json`. Do not update unrelated dependency ranges.

- [ ] **Step 4: Verify the contract.** Run `npm run test:release`, `npm run check-types`, and `npm run lint`. Expected: release assertions, typecheck, and lint all pass. The package script is added and tested in Task 5.

- [ ] **Step 5: Commit.**

  ```bash
  git add .nvmrc package.json package-lock.json scripts/test-release-config.mjs
  git commit -m "build: standardize Node 24 and quality scripts"
  ```

## Task 2: Make subprocess tests deterministic on Node 24

**Files:**

- Modify: `src/test/unit/processRunner.test.ts`
- Modify: `src/test/unit/runProcess.test.ts`
- Modify: `src/platform/processRunner.ts` only if a regression test demonstrates a production defect
- Modify: `src/platform/runProcess.ts` only if a regression test demonstrates a production defect

**Interfaces:**

- Preserves `runProcess(request: ProcessRequest): Promise<ProcessResult>`.
- Preserves `runProcess(executable, args, options): Promise<RunProcessResult>`.

- [ ] **Step 1: Replace fragile child fixtures with deterministic writers.** Add a test helper in each test file that executes a platform-available command with an explicit stream-completion signal. For Node-based fixtures, the `-e` program must wait for the `process.stdout.write` and `process.stderr.write` callbacks before exiting; for the 11 MiB cap case, keep the child alive until the write callback or use a shell/fixture that emits the complete payload. Do not weaken the output assertions or the cap assertion.

- [ ] **Step 2: Reproduce the current failure on Node 24.** Run `npm run test:unit`. Expected before the fixture change: the existing stdout/stderr assertions fail with empty output and the large-output rejection is not observed.

- [ ] **Step 3: Implement only the test-fixture correction.** Keep the production runners’ timeout, no-shell execution, and output-limit semantics unchanged unless the new deterministic test still exposes a real defect. If production code changes, add a focused assertion for that behavior before changing it.

- [ ] **Step 4: Verify repeatedly.** Run `npm run test:unit` three times under Node 24. Expected: all unit tests pass in every run with no intermittent subprocess failures.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/test/unit/processRunner.test.ts src/test/unit/runProcess.test.ts src/platform/processRunner.ts src/platform/runProcess.ts
  git commit -m "test: make process fixtures deterministic on Node 24"
  ```

## Task 3: Add real Buf formatting integration coverage

**Files:**

- Create: `src/test/fixtures/formatting/unformatted.proto`
- Create: `src/test/fixtures/formatting/expected.proto`
- Modify: `src/test/integration/suite/formatting.test.ts`
- Modify: `src/test/integration/runTest.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/test-release-config.mjs`

**Interfaces:**

- The integration launcher receives a pinned Buf executable path through an environment variable or a fixture-specific setting.
- The formatting test asserts a non-empty `TextEdit[]` whose replacement equals the expected formatted fixture.

- [ ] **Step 1: Create valid fixtures that need formatting.** Add a minimal Protobuf document with deliberately inconsistent spacing/indentation and an expected Buf-formatted version. Keep it independent of generated Go files and external imports.

- [ ] **Step 2: Tighten the failing assertion.** Change `formatting.test.ts` so `vscode.executeFormatDocumentProvider` must return an array with one full-document edit, and assert that applying the edit produces the contents of `expected.proto`. Remove the current `undefined`-or-array acceptance.

- [ ] **Step 3: Add a Buf setup step to CI.** In the integration test job, install a pinned Buf CLI release using the official Buf installation mechanism, expose its executable path to the test process, and print `buf --version` before running the test. Keep the version in one constant tested by `scripts/test-release-config.mjs`.

- [ ] **Step 4: Make the launcher fail clearly without Buf.** Update `runTest.ts` to check the configured executable before launching VS Code and exit with a message naming the required pinned version. This prevents a silent false-positive integration run.

- [ ] **Step 5: Verify.** Run the integration suite with the pinned Buf binary. Expected: formatting returns the expected edit and all existing generated-Go integration tests still pass.

- [ ] **Step 6: Commit.**

  ```bash
  git add src/test/fixtures/formatting src/test/integration/suite/formatting.test.ts src/test/integration/runTest.ts .github/workflows/ci.yml scripts/test-release-config.mjs
  git commit -m "test: verify formatting with pinned Buf"
  ```

## Task 4: Invalidate Buf-root discovery when workspace metadata changes

**Files:**

- Modify: `src/lsp/rootDiscovery.ts`
- Modify: `src/extension.ts`
- Modify: `src/test/unit/rootDiscovery.test.ts`
- Create: `src/ui/workspaceWatchers.ts`
- Create: `src/test/unit/workspaceWatchers.test.ts`

**Interfaces:**

- `invalidateRootCache(directory?: string): void` remains the public invalidation API.
- `registerWorkspaceWatchers(context, navigation)` owns both Buf metadata and generated-Go watcher registration and returns a disposable registration.
- The extension calls `registerWorkspaceWatchers()` during activation; unit tests inject watcher factories without starting VS Code.

- [ ] **Step 1: Add cache invalidation tests.** Extend `rootDiscovery.test.ts` with separate create, modify, and delete scenarios for `buf.yaml` and assert that the next `findBufRoot()` call reflects the filesystem. Add a boundary test proving invalidation does not allow a root outside the workspace boundary.

- [ ] **Step 2: Implement safe invalidation.** Keep `invalidateRootCache(directory?)` as the public API, but make its behavior explicit: clear all root-cache entries both for a global invalidation and for a metadata-file event. This is conservative, avoids retaining stale roots across workspace boundaries, and preserves the existing 512-entry bounded cache without expanding `BoundedCache`’s API.

- [ ] **Step 3: Extract and register workspace watchers.** Move watcher construction into `src/ui/workspaceWatchers.ts`. Its Buf metadata watcher covers `buf.yaml`, `buf.lock`, `buf.gen.yaml`, and `buf.work.yaml`, calls `invalidateRootCache()`, and disposes all file-event subscriptions during workspace-folder/configuration changes and extension shutdown. Keep the generated-Go watcher behavior and `navigation.invalidate(uri.fsPath)` intact.

- [ ] **Step 4: Verify.** Run `src/test/unit/workspaceWatchers.test.ts`, the root-discovery unit tests, and the full unit suite. The watcher unit test must assert that create/change/delete events call `invalidateRootCache()` and generated-Go events call `navigation.invalidate()`. In the integration fixture, create a nested `buf.yaml`, trigger the watcher, and confirm a subsequent navigation/health lookup uses the new root.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/lsp/rootDiscovery.ts src/extension.ts src/ui/workspaceWatchers.ts src/test/unit/rootDiscovery.test.ts src/test/unit/workspaceWatchers.test.ts
  git commit -m "fix: refresh Buf roots when workspace metadata changes"
  ```

## Task 5: Restrict and test VSIX contents

**Files:**

- Modify: `package.json`
- Modify: `.vscodeignore`
- Create: `scripts/test-package-config.mjs`
- Modify: `scripts/test-release-config.mjs`
- Delete: `logo.png` after confirming the resource hash matches `resources/bufbear.png`

**Interfaces:**

- `npm run test:package` packages the extension and fails if a development-only path is present, a required runtime path is absent, or the VSIX exceeds the selected size budget.
- The package allowlist includes `dist`, `resources`, `syntaxes`, `language-configuration.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, and `THIRD_PARTY_NOTICES.md`.

- [ ] **Step 1: Add a failing package-content test.** Create `test-package-config.mjs` that invokes `vsce package --no-dependencies` into a temporary output directory, reads the resulting ZIP central directory, normalizes `extension/` paths, and asserts the allowlist. Assert that `.codex/`, `.husky/`, `.github/`, `docs/superpowers/`, `src/`, `scripts/`, `node_modules/`, root build configs, and `logo.png` are absent. Assert the package is below a documented 2 MiB compressed-size budget.

- [ ] **Step 2: Define the package allowlist.** Add the `files` list to `package.json` for runtime/public files and update `.vscodeignore` with explicit exclusions for `.codex/**`, `.husky/**`, `docs/superpowers/**`, `scripts/**`, `logo.png`, and development metadata. Keep `resources/bufbear.png` because it is referenced by `package.json.icon`.

- [ ] **Step 3: Remove the duplicate asset.** Verify `sha256sum logo.png resources/bufbear.png` matches, confirm no README or build file references the root asset, then remove only the tracked root `logo.png`. The resource copy remains the marketplace icon.

- [ ] **Step 4: Verify the package.** Run `npm run test:package`, inspect the archive listing, and assert that `package.json.main` points to `extension/dist/extension.js`. Expected: no development files and a compressed package below the budget.

- [ ] **Step 5: Commit.**

  ```bash
  git add package.json .vscodeignore scripts/test-package-config.mjs scripts/test-release-config.mjs
  git rm logo.png
  git commit -m "build: restrict VSIX contents and size"
  ```

## Task 6: Align documentation and release metadata

**Files:**

- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json` only for metadata that semantic-release owns
- Modify: `package-lock.json` if the root version is synchronized
- Modify: `scripts/test-release-config.mjs`

**Interfaces:**

- README documents every contributed command and setting, including `bufBear.formatDocument` and `bufBear.formatting.enabled`.
- Release tests reject a `package.json`/lockfile root-version mismatch and assert that the Marketplace asset path uses the tag-resolved version.

- [ ] **Step 1: Add failing metadata assertions.** Extend `test-release-config.mjs` to load `package.json` and `package-lock.json`, assert equal root versions, assert the README contains all contributed command IDs/settings, and assert release workflow failure semantics are not hidden by `continue-on-error`.

- [ ] **Step 2: Align public documentation.** Add the missing formatting command to the README command table and the formatting setting to the settings table. Document that Buf is required for LSP/formatting integration and that generated-Go navigation can operate independently.

- [ ] **Step 3: Normalize release files.** Choose the repository’s semantic-release-managed version as the source of truth, synchronize the package and lockfile root versions, and add a correctly formatted changelog entry for the next release only when the release scope is known. Do not manually invent a marketplace version unrelated to the tag.

- [ ] **Step 4: Verify.** Run `npm run test:release`, inspect `git diff --check`, and confirm the documentation assertions pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add README.md CHANGELOG.md package.json package-lock.json scripts/test-release-config.mjs
  git commit -m "docs: align extension settings and release metadata"
  ```

## Task 7: Port Watchman’s CI/CD structure without Docker

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pr-title.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/test-release-config.mjs`

**Interfaces:**

- Quality jobs expose stable names for branch protection: `commitlint`, `lint`, `test`, `test-release`, and `build`.
- A `quality` aggregator depends on all five jobs and becomes the release dependency.

- [ ] **Step 1: Add failing workflow contract checks.** In `test-release-config.mjs`, load all three workflows and assert every `actions/checkout` uses `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0`, every `actions/setup-node` uses `820762786026740c76f36085b0efc47a31fe5020`, and every setup step uses Node 24. Assert the quality job’s exact dependencies and that release needs `quality`.

- [ ] **Step 2: Port secure workflow defaults.** Apply Watchman’s `permissions: contents: read`, concurrency cancellation, timeouts, npm cache, pinned checkout/setup-node actions, and `npm ci` to BufBear’s existing jobs. Pin dependency-review to `3b139cfc5fae8b618d3eae3675e383bb1769c019` and update its version comment to `v4.5.0`.

- [ ] **Step 3: Separate quality jobs.** Keep commitlint, lint/typecheck, unit/integration, release-config, and VSIX packaging as independently visible jobs. Add the Buf installation step only to the integration test job. Add a `quality` job with `needs: [commitlint, lint, test, test-release, build]` and a no-op success step.

- [ ] **Step 4: Harden release failure behavior.** Keep release tag snapshot and resolution scripts, but make semantic-release failure fail the release job. Publish only when the resolver reports exactly one new stable tag and use the resolved VSIX path. Keep Marketplace credentials in the environment and permissions minimal.

- [ ] **Step 5: Update PR title workflow.** Add Watchman’s concurrency and pinned actions, use `printf '%s\\n' "$PR_TITLE" | npx --no -- commitlint`, and preserve read-only pull-request permissions.

- [ ] **Step 6: Verify workflow contracts.** Run `npm run test:release` and inspect the rendered workflow YAML for every job’s Node/setup/action pin. Expected: all configuration assertions pass and no Docker job appears.

- [ ] **Step 7: Commit.**

  ```bash
  git add .github/workflows/ci.yml .github/workflows/pr-title.yml .github/workflows/release.yml scripts/test-release-config.mjs
  git commit -m "ci: adopt pinned Node 24 quality gates"
  ```

## Task 8: Add Watchman-inspired repository governance

**Files:**

- Create: `.github/CODEOWNERS`
- Create: `.github/dependabot.yml`
- Create: `.github/pull_request_template.md`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Modify: `scripts/test-release-config.mjs`

**Interfaces:**

- Dependabot targets `dev`, runs weekly on npm and GitHub Actions, groups minor/patch updates, and uses `fix(deps)`/`chore(ci)` prefixes.
- Issue forms collect VS Code version, OS, Buf version/path, BufBear version, reproduction steps, expected behavior, and actual behavior.
- Security reports link to `https://github.com/Diaszano/bufbear/security/advisories/new` and disable blank public issues.

- [ ] **Step 1: Add configuration tests.** Extend `test-release-config.mjs` to parse the new YAML/Markdown files and assert Dependabot’s `dev` target, weekly schedules, npm/actions ecosystems, grouped minor/patch updates, CODEOWNERS coverage for `*` and `.github/`, the required PR checklist entries, and the security advisory contact link.

- [ ] **Step 2: Add ownership and dependency automation.** Create CODEOWNERS with `@diaszano` as the default and `.github/ @diaszano`. Add the two Dependabot update blocks with Monday 09:00 America/Sao_Paulo schedules and a maximum of five open npm PRs and three Actions PRs.

- [ ] **Step 3: Add review and issue intake templates.** Adapt Watchman’s PR checklist to require Conventional Commits, lint, typecheck, unit/integration tests, release test, VSIX package test, and documentation review. Add bug and feature forms with extension-specific fields and the security advisory link.

- [ ] **Step 4: Verify.** Run `npm run test:release` and parse each YAML form with the same loader used by the test. Expected: governance files are valid and all required fields/policies are present.

- [ ] **Step 5: Commit.**

  ```bash
  git add .github/CODEOWNERS .github/dependabot.yml .github/pull_request_template.md .github/ISSUE_TEMPLATE scripts/test-release-config.mjs
  git commit -m "chore: add repository governance automation"
  ```

## Task 9: Run the complete verification matrix and handoff

**Files:**

- Modify: `README.md` or test documentation only if a verification command changes
- Modify: `scripts/test-release-config.mjs` only if a discovered contract mismatch is corrected

- [ ] **Step 1: Select Node 24.** Run `nvm use 24` or the repository’s Node-version manager equivalent, then verify `node --version` reports `v24.x` and `npm --version` is the bundled npm for that Node line.

- [ ] **Step 2: Install cleanly.** Run `npm ci`. Expected: no lockfile mutation.

- [ ] **Step 3: Run quality commands.** Run `npm run lint`, `npm run check-types`, `npm run test:unit`, `npm run test:release`, and `npm run test:package`. Expected: all pass.

- [ ] **Step 4: Run integration with Buf.** Run `xvfb-run -a npm run test:integration` on Linux or the equivalent headless command. Expected: formatting and generated-Go suites pass with the pinned Buf binary.

- [ ] **Step 5: Inspect the package.** Confirm the VSIX listing has only approved public files, `extension/package.json` points to `extension/dist/extension.js`, and the compressed size remains below the enforced budget.

- [ ] **Step 6: Review the aggregate gate.** Confirm `.github/workflows/ci.yml` has the Watchman-inspired job names, Node 24 everywhere, pinned action SHAs, least-privilege permissions, and `release.needs` includes `quality`.

- [ ] **Step 7: Commit verification-only fixes and report results.** If the matrix exposes a documentation or contract mismatch, make the smallest focused correction, rerun the affected command, and commit it with a Conventional Commit. Report all commands and results, including any platform-specific limitation.

## Handoff

After this plan is approved, execute it with either `superpowers:subagent-driven-development` (fresh agent and review checkpoint per task) or `superpowers:executing-plans` (inline batches with checkpoints). Do not combine unrelated user worktree changes with these commits.
