# Design: package.json Scripts Improvement

Improve and correct the build, test, lint, and package scripts defined in `package.json` to ensure correctness, remove redundant package calls, and optimize the bundle size for production.

## 1. Context & Motivation
- The `npm run verify` command fails because it points to `npm run check-types` which is not defined in `package.json` (the type checking script is named `check`).
- The `vscode:prepublish` script runs `npm run package`, which in turn executes `vsce package`. This causes recursive behavior, because `vsce package` natively invokes the `vscode:prepublish` hook.
- `package:vsix` executes `npm run package` followed by `vsce package`, resulting in duplicate packaging.
- The `esbuild.mjs` script supports a `--production` flag (which minifies the code and disables inline sourcemaps), but no package/prepublish script currently passes it.
- There is no standard `npm test` script.

## 2. Proposed Design

### Script Configuration Changes

The scripts block in `package.json` will be updated to:

```json
  "scripts": {
    "compile": "tsc -p tsconfig.json",
    "clean": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true});require('node:fs').rmSync('out',{recursive:true,force:true})\"",
    "check": "tsc -p tsconfig.json --noEmit",
    "compile-tests": "tsc -p tsconfig.json --outDir out --noEmit false",
    "lint": "eslint .",
    "test": "npm run test:unit",
    "test:unit": "npm run compile-tests && mocha \"out/test/unit/**/*.test.js\"",
    "test:integration": "npm run bundle && npm run compile-tests && node out/test/integration/runTest.js",
    "test:commits": "bash .github/scripts/validate-commits.sh",
    "test:release": "node scripts/test-release-config.mjs",
    "bundle": "node esbuild.mjs",
    "bundle:prod": "node esbuild.mjs --production",
    "package": "vsce package --no-dependencies",
    "package:vsix": "npm run verify && npm run package",
    "verify": "npm run lint && npm run check && npm run test:unit",
    "vscode:prepublish": "npm run clean && npm run check && npm run bundle:prod",
    "prepare": "husky"
  }
```

### Justification of Changes
1. **`test`**: Maps to `npm run test:unit` to allow standard `npm test` runs.
2. **`verify`**: Replaces `check-types` with `check` (which runs `tsc -p tsconfig.json --noEmit`).
3. **`bundle:prod`**: Runs `node esbuild.mjs --production` to compile, minify, and disable inline source maps for the release build.
4. **`vscode:prepublish`**: Prepares the workspace for packaging by cleaning the directories (`npm run clean`), type-checking (`npm run check`), and compiling the optimized production bundle (`npm run bundle:prod`). It no longer calls `vsce package`, which prevents recursive build loop.
5. **`package`**: Triggers `vsce package --no-dependencies`. By standard npm/vsce flow, this automatically invokes the `vscode:prepublish` hook beforehand.
6. **`package:vsix`**: Verifies the build and runs the simplified `package` script.

## 3. Verification Plan
1. Check that `npm run check` runs successfully.
2. Check that `npm run lint` runs successfully.
3. Check that `npm run test` executes unit tests.
4. Check that `npm run verify` executes without errors.
5. Check that `npm run package` (and `package:vsix`) generates the optimized VSIX file without duplicate or recursive packaging.
