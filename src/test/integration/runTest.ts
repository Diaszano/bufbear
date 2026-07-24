import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  try {
    const requiredVersion = process.env.BUF_VERSION ?? "1.61.0";
    const bufPath = process.env.BUF_BIN ?? "buf";
    const probe = spawnSync(bufPath, ["--version"], { encoding: "utf8" });
    const actualVersion = probe.stdout.trim();
    if (probe.status !== 0 || actualVersion !== requiredVersion) {
      throw new Error(
        `Pinned Buf ${requiredVersion} is required; executable '${bufPath}' reported '${actualVersion || "unavailable"}'`
      );
    }
    console.log(`Using Buf ${probe.stdout.trim()} (required ${requiredVersion})`);
    const extensionDevelopmentPath = path.resolve(__dirname, "../../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index.test.js");
    const testWorkspace = path.resolve(__dirname, "../../../src/test/fixtures/generated-go");

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testWorkspace, "--disable-extensions"]
    });
  } catch (err) {
    console.error("Failed to run integration tests:", err);
    process.exit(1);
  }
}

void main();
