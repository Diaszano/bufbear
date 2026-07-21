import * as path from "node:path";
import * as fs from "node:fs";
import Mocha from "mocha";

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: "bdd",
    color: true,
    timeout: 20000
  });

  const testsRoot = __dirname;
  const files = fs.readdirSync(testsRoot).filter((f) => f.endsWith(".test.js") && f !== "index.test.js");
  for (const file of files) {
    mocha.addFile(path.resolve(testsRoot, file));
  }

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${String(failures)} integration test(s) failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
