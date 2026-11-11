import { execFile } from "child_process";

export interface RunResult {
  stdout: string;
  /** The last line of the traceback, when the code raised. */
  error?: string;
  timedOut?: boolean;
  /** Python couldn't be started at all. */
  missing?: boolean;
}

/** Run Python source or a file and collect what it prints. Never throws. */
export function runPython(python: string, args: string[], timeoutMs = 8000, cwd?: string): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(python, args, { timeout: timeoutMs, maxBuffer: 1 << 20, cwd, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" } }, (err, stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === "ENOENT") return resolve({ stdout: "", missing: true });
      const res: RunResult = { stdout: stdout.replace(/\r\n/g, "\n") };
      if (err && (err as { killed?: boolean }).killed) res.timedOut = true;
      else if (err) {
        const last = stderr.trim().split("\n").pop();
        if (last) res.error = last;
      }
      resolve(res);
    });
  });
}
