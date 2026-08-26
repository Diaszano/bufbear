import assert from "node:assert/strict";
import { LSP_RESTART_SETTINGS, shouldRestartLsp } from "../../config/restartDecision.js";

function affects(changed: string[]): (section: string) => boolean {
  return (section) => changed.includes(section);
}

describe("shouldRestartLsp", () => {
  it("returns true when bufBear.buf.path changes", () => {
    assert.equal(shouldRestartLsp(affects(["bufBear.buf.path"])), true);
  });

  it("returns true when bufBear.lsp.enabled changes", () => {
    assert.equal(shouldRestartLsp(affects(["bufBear.lsp.enabled"])), true);
  });

  it("returns true when bufBear.buf.trace.server changes", () => {
    assert.equal(shouldRestartLsp(affects(["bufBear.buf.trace.server"])), true);
  });

  it("returns false for settings that do not affect the LSP", () => {
    assert.equal(shouldRestartLsp(affects(["bufBear.go.enabled"])), false);
    assert.equal(shouldRestartLsp(affects(["bufBear.go.genRoot"])), false);
    assert.equal(shouldRestartLsp(affects(["bufBear.formatting.enabled"])), false);
    assert.equal(shouldRestartLsp(affects(["bufBear.conflictWarning.enabled"])), false);
    assert.equal(shouldRestartLsp(affects(["bufBear.notifications.missingBuf"])), false);
  });

  it("returns false when no relevant key changes", () => {
    assert.equal(shouldRestartLsp(affects([])), false);
  });

  it("returns true when multiple relevant keys change together", () => {
    assert.equal(
      shouldRestartLsp(affects(["bufBear.lsp.enabled", "bufBear.buf.path", "bufBear.go.genRoot"])),
      true
    );
  });

  it("exposes exactly the three LSP-affecting settings", () => {
    assert.deepEqual([...LSP_RESTART_SETTINGS], [
      "bufBear.buf.path",
      "bufBear.lsp.enabled",
      "bufBear.buf.trace.server"
    ]);
  });
});
