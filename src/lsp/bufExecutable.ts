import { runProcess, type ProcessResult } from "../platform/processRunner.js";

export interface BufProbe {
  readonly executable: string;
  readonly version: string;
  readonly supportsLsp: boolean;
}

type Runner = (request: {
  executable: string;
  args: readonly string[];
  timeoutMs: number;
}) => Promise<ProcessResult>;

export async function probeBuf(
  executable: string,
  runner: Runner = runProcess
): Promise<BufProbe> {
  if (executable.length === 0 || /[\0\r\n]/u.test(executable)) {
    throw new Error("Buf executable must be a non-empty path or command name");
  }

  const version = await runner({
    executable,
    args: ["--version"],
    timeoutMs: 5000
  });
  if (version.exitCode !== 0 || version.timedOut) {
    throw new Error("Buf version probe failed");
  }

  const lsp = await runner({
    executable,
    args: ["lsp", "serve", "--help"],
    timeoutMs: 5000
  });

  return {
    executable,
    version: version.stdout.trim(),
    supportsLsp: lsp.exitCode === 0 && !lsp.timedOut
  };
}
