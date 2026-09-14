import assert from "node:assert/strict";
import type * as vscode from "vscode";
import {
  checkConflicts,
  resetConflictWarningSession,
  subscribeToExtensionChanges,
  FULL_PROTO_EXTENSIONS,
  type ConflictDetectorDependencies
} from "../../ui/conflictDetector.js";
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

function createFakeExtensionEvent(): {
  onDidChange: (listener: (e: unknown) => void) => vscode.Disposable;
  fire: () => void;
} {
  const listeners = new Set<(e: unknown) => void>();
  return {
    onDidChange: (listener) => {
      listeners.add(listener);
      return {
        dispose: () => {
          listeners.delete(listener);
        }
      };
    },
    fire: () => {
      for (const listener of [...listeners]) {
        listener(undefined);
      }
    }
  };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
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

    const dependencies: ConflictDetectorDependencies = {
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

  it("handles Open Extensions action cleanly without throwing", async () => {
    await checkConflicts({
      readConfig: () => createDefaultConfig(),
      getExtension: (id) => (id === "bufbuild.vscode-buf" ? ({ isActive: true } as vscode.Extension<unknown>) : undefined),
      showWarningMessage: async () => Promise.resolve("Open Extensions")
    });
  });

  it("warns exactly once when a conflicting extension activates only after onDidChange fires", async () => {
    let warningCount = 0;
    let conflictActive = false;
    const event = createFakeExtensionEvent();

    subscribeToExtensionChanges({
      readConfig: () => createDefaultConfig(),
      getExtension: (id) =>
        conflictActive && id === FULL_PROTO_EXTENSIONS[0] ? ({ isActive: true } as vscode.Extension<unknown>) : undefined,
      showWarningMessage: () => {
        warningCount++;
        return Promise.resolve("Ignore");
      },
      extensions: { onDidChange: event.onDidChange }
    });

    event.fire();
    await settle();
    assert.strictEqual(warningCount, 0);

    conflictActive = true;
    event.fire();
    await settle();
    assert.strictEqual(warningCount, 1);
  });

  it("shows at most one warning across multiple onDidChange firings", async () => {
    let warningCount = 0;
    const event = createFakeExtensionEvent();

    subscribeToExtensionChanges({
      readConfig: () => createDefaultConfig(),
      getExtension: (id) => (id === FULL_PROTO_EXTENSIONS[0] ? ({ isActive: true } as vscode.Extension<unknown>) : undefined),
      showWarningMessage: () => {
        warningCount++;
        return Promise.resolve("Ignore");
      },
      extensions: { onDidChange: event.onDidChange }
    });

    event.fire();
    event.fire();
    event.fire();
    await settle();

    assert.strictEqual(warningCount, 1);
  });

  it("stops calling checkConflicts after the subscription is disposed", async () => {
    let configReads = 0;
    const event = createFakeExtensionEvent();

    const subscription = subscribeToExtensionChanges({
      readConfig: () => {
        configReads++;
        return createDefaultConfig();
      },
      getExtension: () => undefined,
      showWarningMessage: () => Promise.resolve("Ignore"),
      extensions: { onDidChange: event.onDidChange }
    });

    event.fire();
    await settle();
    assert.strictEqual(configReads, 1);

    subscription.dispose();
    event.fire();
    event.fire();
    await settle();
    assert.strictEqual(configReads, 1);
  });

  it("never warns from onDidChange when no conflicting extension is active", async () => {
    let warnCalled = false;
    const event = createFakeExtensionEvent();

    subscribeToExtensionChanges({
      readConfig: () => createDefaultConfig(),
      getExtension: () => undefined,
      showWarningMessage: () => {
        warnCalled = true;
        return Promise.resolve(undefined);
      },
      extensions: { onDidChange: event.onDidChange }
    });

    event.fire();
    event.fire();
    await settle();

    assert.strictEqual(warnCalled, false);
  });

  it("returns a no-op disposable when no onDidChange provider is available", () => {
    const subscription = subscribeToExtensionChanges({});
    assert.doesNotThrow(() => subscription.dispose());
  });
});
