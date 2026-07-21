import assert from "node:assert/strict";
import type * as vscode from "vscode";
import { checkConflicts, resetConflictWarningSession, FULL_PROTO_EXTENSIONS } from "../../ui/conflictDetector.js";
import type { BufBearConfig } from "../../config/types.js";

function createDefaultConfig(overrides: Partial<BufBearConfig> = {}): BufBearConfig {
  return {
    lspEnabled: true,
    bufPath: "buf",
    traceServer: "off",
    missingBufNotification: true,
    goEnabled: true,
    goGenRoot: "gen/proto-go",
    goSourceRelative: true,
    conflictWarningEnabled: true,
    formattingEnabled: true,
    ...overrides
  };
}

describe("ConflictDetector", () => {
  beforeEach(() => {
    resetConflictWarningSession();
  });

  it("does not warn when no conflicting extension is active", async () => {
    let warnCalled = false;
    await checkConflicts({
      readConfig: () => createDefaultConfig(),
      getExtension: () => undefined,
      showWarningMessage: async () => {
        warnCalled = true;
        return Promise.resolve(undefined);
      }
    });

    assert.strictEqual(warnCalled, false);
  });

  it("warns once per session when a conflicting extension is active", async () => {
    let warningCount = 0;
    const fakeShowWarning = async (): Promise<string> => {
      warningCount++;
      return Promise.resolve("Ignore");
    };

    const dependencies = {
      readConfig: () => createDefaultConfig(),
      getExtension: (id: string) => (id === FULL_PROTO_EXTENSIONS[0] ? ({ isActive: true } as vscode.Extension<unknown>) : undefined),
      showWarningMessage: fakeShowWarning
    };

    await checkConflicts(dependencies);
    assert.strictEqual(warningCount, 1);

    // Call again in same session
    await checkConflicts(dependencies);
    assert.strictEqual(warningCount, 1); // Not warned again
  });

  it("does not warn when conflictWarning.enabled is false", async () => {
    let warnCalled = false;
    await checkConflicts({
      readConfig: () => createDefaultConfig({ conflictWarningEnabled: false }),
      getExtension: () => ({ isActive: true } as vscode.Extension<unknown>),
      showWarningMessage: async () => {
        warnCalled = true;
        return Promise.resolve(undefined);
      }
    });

    assert.strictEqual(warnCalled, false);
  });

  it("does not warn when lsp.enabled is false", async () => {
    let warnCalled = false;
    await checkConflicts({
      readConfig: () => createDefaultConfig({ lspEnabled: false }),
      getExtension: () => ({ isActive: true } as vscode.Extension<unknown>),
      showWarningMessage: async () => {
        warnCalled = true;
        return Promise.resolve(undefined);
      }
    });

    assert.strictEqual(warnCalled, false);
  });

  it("disables BufBear LSP when user chooses Disable BufBear LSP", async () => {
    let updatedConfig: { section: string; value: unknown; target: unknown } | undefined;

    await checkConflicts({
      readConfig: () => createDefaultConfig(),
      getExtension: (id) => (id === "bufbuild.vscode-buf" ? ({ isActive: true } as vscode.Extension<unknown>) : undefined),
      showWarningMessage: async () => Promise.resolve("Disable BufBear LSP"),
      updateConfig: async (section, value, target) => {
        updatedConfig = { section, value, target };
        await Promise.resolve();
      }
    });

    assert.deepStrictEqual(updatedConfig, {
      section: "bufBear.lsp.enabled",
      value: false,
      target: 2 // Workspace target
    });
  });
});
