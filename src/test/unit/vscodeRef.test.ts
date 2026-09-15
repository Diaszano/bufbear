import assert from "node:assert/strict";
import { getVscode } from "../../platform/vscodeRef.js";

describe("vscodeRef", () => {
  it("returns undefined outside the VS Code extension host", () => {
    assert.equal(getVscode(), undefined);
  });
});
