# package.json Scripts Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify `package.json` scripts to fix broken commands, standardize testing, optimize production bundling, and resolve package recursion.

**Architecture:** Update the JSON scripts dictionary to introduce optimized prepublish/package workflows, correct check-types reference to check, and add a standard test script.

**Tech Stack:** npm, Node.js, vsce

## Global Constraints
- Keep dependencies lean and use existing tool binaries.
- Ensure all commands are cross-platform (e.g. clean uses node -e).

---

### Task 1: Modify package.json Scripts

**Files:**
- Modify: `package.json` (lines 155 to 171)

**Interfaces:**
- Consumes: N/A
- Produces: Updated scripts dictionary

- [ ] **Step 1: Modify package.json with the new scripts**

Replace lines 155 to 171 in `package.json` with the following content:

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
  },
```

- [ ] **Step 2: Run verification script**

Run: `npm run verify`
Expected: SUCCESS. Linting passes, TypeScript checks pass, and all 139 unit tests pass.

- [ ] **Step 3: Run standard test script**

Run: `npm test`
Expected: SUCCESS. Executes `npm run test:unit` and all unit tests pass.

- [ ] **Step 4: Run package script to verify packaging**

Run: `npm run package`
Expected: SUCCESS. Produces a `.vsix` file in the workspace root without loops.

- [ ] **Step 5: Run package:vsix script**

Run: `npm run package:vsix`
Expected: SUCCESS. Runs verification first, then produces the `.vsix` file.

- [ ] **Step 6: Commit changes**

Run:
```bash
git add package.json
git commit -m "chore: correct and improve package.json scripts"
```
