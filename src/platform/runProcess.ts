import { spawn } from "node:child_process";

export interface ProcessOptions {
  cwd?: string;
  stdin?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface RunProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
  timedOut?: boolean;
}

const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MiB buffer cap per spec

export function runProcess(
  executable: string,
  args: readonly string[],
  options: ProcessOptions = {}
): Promise<RunProcessResult> {
  if (/[\0\r\n]/.test(executable)) {
    return Promise.reject(new Error("Executable path contains invalid control characters"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const child = spawn(executable, [...args], {
      shell: false,
      cwd: options.cwd,
      env: options.env
    });

    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (killTimer) {
        clearTimeout(killTimer);
        killTimer = undefined;
      }
    };

    const timeoutMs = options.timeoutMs ?? 5000;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 1000);
        killTimer.unref();
      }, timeoutMs);
    }

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    let stdoutBytes = 0;
    const stdoutChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) {
        return;
      }
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_BUFFER_BYTES) {
        settled = true;
        cleanup();
        child.kill("SIGKILL");
        reject(new Error("Process output buffer limit exceeded"));
        return;
      }
      stdoutChunks.push(chunk);
    });

    let stderrBytes = 0;
    const stderrChunks: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => {
      if (settled) {
        return;
      }
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_BUFFER_BYTES) {
        settled = true;
        cleanup();
        child.kill("SIGKILL");
        reject(new Error("Process output buffer limit exceeded"));
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (err) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(err);
    });

    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();

      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");

      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal,
        timedOut
      });
    });
  });
}
