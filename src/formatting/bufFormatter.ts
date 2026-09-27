import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { runProcess as defaultRunProcess } from "../platform/runProcess.js";

export interface FormatInput {
  text: string;
  bufPath: string;
  cwd: string;
  timeoutMs?: number;
  runProcess?: typeof defaultRunProcess;
}

export type FormatResult = { success: true; formattedText: string } | { success: false; error: string };

export async function formatProtoText(input: FormatInput): Promise<FormatResult> {
  const runner = input.runProcess ?? defaultRunProcess;
  const timeoutMs = input.timeoutMs ?? 5000;
  let temporaryDirectory: string | undefined;

  try {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "bufbear-format-"));
    const temporaryProto = path.join(temporaryDirectory, "input.proto");
    await writeFile(temporaryProto, input.text, "utf8");

    const res = await runner(input.bufPath, ["format", temporaryProto], {
      cwd: input.cwd,
      timeoutMs,
    });

    if (res.timedOut) {
      return { success: false, error: `Formatting timed out after ${String(timeoutMs)}ms` };
    }

    if (res.exitCode !== 0) {
      const errorMsg = res.stderr.trim() || `buf format exited with code ${String(res.exitCode)}`;
      return { success: false, error: errorMsg };
    }

    return { success: true, formattedText: res.stdout };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
