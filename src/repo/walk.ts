// Reads a repository from disk: every file's path and size, and the text of
// the ones worth reading. Never reads files that may hold secrets.
import { promises as fs } from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { IGNORED_DIRS, gitignore, isBinaryPath, isSecretPath } from "./files";
import type { RepoFile } from "./types";

export interface WalkOptions {
  maxFiles?: number; // stop listing after this many
  maxRead?: number; // read the text of at most this many
  maxBytes?: number; // don't read files bigger than this
}

export interface WalkResult {
  files: RepoFile[];
  totalFiles: number;
  truncated: boolean;
}

export async function walkRepo(root: string, opts: WalkOptions = {}): Promise<WalkResult> {
  const maxFiles = opts.maxFiles ?? 20_000;
  const maxRead = opts.maxRead ?? 4_000;
  const maxBytes = opts.maxBytes ?? 200_000;
  let ignored = (_p: string, _d: boolean) => false;
  try {
    ignored = gitignore(await fs.readFile(path.join(root, ".gitignore"), "utf8"));
  } catch {
    // no .gitignore
  }

  const files: RepoFile[] = [];
  let truncated = false;
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => b.name.localeCompare(a.name)); // popped in A→Z order
    for (const e of entries) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name) && !ignored(p, true) && !(e.name.startsWith(".") && e.name !== ".github")) stack.push(p);
      } else if (e.isFile() && !ignored(p, false) && e.name !== ".DS_Store") {
        if (files.length >= maxFiles) {
          truncated = true;
          continue;
        }
        files.push({ path: p, size: 0 });
      }
    }
  }

  // Sizes for all; then the text of the first `maxRead` readable files, in path order.
  files.sort((a, b) => a.path.localeCompare(b.path));
  await inParallel(files, async (f) => {
    try {
      f.size = (await fs.stat(path.join(root, f.path))).size;
    } catch {
      // vanished: keep the name only
    }
  });
  const toRead = files.filter((f) => !isSecretPath(f.path) && !isBinaryPath(f.path) && f.size <= maxBytes).slice(0, maxRead);
  await inParallel(toRead, async (f) => {
    try {
      const buf = await fs.readFile(path.join(root, f.path));
      if (!buf.subarray(0, 1000).includes(0)) f.text = buf.toString("utf8"); // a NUL byte means binary
    } catch {
      // unreadable: keep the name only
    }
  });
  return { files, totalFiles: files.length, truncated };
}

async function inParallel<T>(items: T[], fn: (x: T) => Promise<void>, width = 32): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

/** How many commits in the last six months touched each file. Empty if git isn't there. */
export function recentChanges(root: string): Promise<Map<string, number>> {
  return new Promise((resolve) => {
    execFile("git", ["log", "--since=6.months", "--name-only", "--pretty=format:", "--no-renames", "--relative", "-n", "2000"], { cwd: root, timeout: 5000, maxBuffer: 32 * 1024 * 1024 }, (err, out) => {
      const counts = new Map<string, number>();
      if (!err) for (const line of out.split("\n")) if (line.trim()) counts.set(line.trim(), (counts.get(line.trim()) ?? 0) + 1);
      resolve(counts);
    });
  });
}
