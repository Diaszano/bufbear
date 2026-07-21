import assert from "node:assert/strict";
import { RestartPolicy } from "../../lsp/restartPolicy.js";

describe("RestartPolicy", () => {
  it("follows exponential delay schedule [0, 1000, 3000, 10000] and caps at 4 failures within window", () => {
    const policy = new RestartPolicy();
    assert.equal(policy.recordFailure(0), 0);
    assert.equal(policy.recordFailure(1), 1000);
    assert.equal(policy.recordFailure(2), 3000);
    assert.equal(policy.recordFailure(3), 10000);
    assert.equal(policy.recordFailure(4), undefined);
  });

  it("discards failures older than five minutes (300000 ms)", () => {
    const policy = new RestartPolicy();
    assert.equal(policy.recordFailure(0), 0);
    assert.equal(policy.recordFailure(1000), 1000);
    assert.equal(policy.recordFailure(2000), 3000);
    assert.equal(policy.recordFailure(3000), 10000);
    assert.equal(policy.recordFailure(4000), undefined);

    // After 5 minutes (300,001 ms from t=0, older failures start expiring)
    // At t=304,001, failures at 0, 1000, 2000, 3000, 4000 are all > 300,000 ms ago.
    assert.equal(policy.recordFailure(304001), 0);
  });

  it("resets failure history when reset() is called", () => {
    const policy = new RestartPolicy();
    assert.equal(policy.recordFailure(0), 0);
    assert.equal(policy.recordFailure(1), 1000);
    policy.reset();
    assert.equal(policy.recordFailure(2), 0);
  });
});
