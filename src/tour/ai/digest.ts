// What the AI model gets to read: a compact, deterministic digest of the repo
// index (shared by every call, so it's cached), and numbered excerpts of the
// files that matter, with secrets blanked out. Nothing else leaves the computer.
import type { FileInfo, RepoIndex } from "../../repo/types";
import { redactSecrets } from "./redact";

export type Budget = "small" | "medium" | "large";
/** Input tokens a whole AI tour may use, roughly. */
export const BUDGETS: Record<Budget, number> = { small: 25_000, medium: 60_000, large: 150_000 };

/** A rough token count: code averages about 3.5 characters per token. */
export const estimateTokens = (s: string) => Math.ceil(s.length / 3.5);

/** Per million tokens, input and output, for the models we know. */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-2": [8, 40],
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number | undefined {
  const p = PRICES[model];
  return p ? (inputTokens * p[0] + outputTokens * p[1]) / 1_000_000 : undefined;
}

// ------------------------------------------------------------------ the digest

/** Everything the index knows, as compact text. Stable for a given index, so it caches well. */
export function indexDigest(index: RepoIndex, readme?: string): string {
  const files = index.files;
  const ranked = (b: string) => files.filter((f) => f.bucket === b).sort((a, c) => c.score - a.score);
  const line = (f: FileInfo) =>
    [
      `- ${f.path}`,
      f.role && `role: ${f.role}`,
      f.entry && `entry: ${f.entry.why} (line ${f.entry.line + 1})`,
      f.imports.length && `imports: ${f.imports.slice(0, 8).join(", ")}`,
      f.importedBy.length && `imported by: ${f.importedBy.slice(0, 8).join(", ")}`,
      f.routes.length && `routes: ${f.routes.slice(0, 8).map((r) => `${r.method} ${r.path} (line ${r.line + 1})`).join(", ")}`,
      f.symbols.length && `defines: ${f.symbols.slice(0, 10).map((s) => `${s.name}@${s.line + 1}`).join(", ")}`,
    ]
      .filter(Boolean)
      .join(" | ");
  const parts = [
    `# Repository: ${index.name}`,
    index.description && `Description: ${index.description}`,
    `Languages: ${index.languages.map((l) => `${l.name} (${l.files} files)`).join(", ") || "none detected"}`,
    index.frameworks.length && `Frameworks: ${index.frameworks.map((f) => f.name).join(", ")}`,
    ...index.manifests.slice(0, 4).map((m) => `Manifest ${m.path}: ${Object.entries(m.scripts).slice(0, 8).map(([k, v]) => `${k} = ${v}`).join("; ") || "no scripts"}; ${m.deps.length} dependencies (${m.deps.slice(0, 12).join(", ")})`),
    "",
    "## Folders",
    ...index.folders.map((f) => `- ${f.path}/: ${f.role} (${f.files} files)`),
    "",
    "## Start here (entry points)",
    ...ranked("start").map(line),
    "",
    "## Core files",
    ...ranked("core").map(line),
    "",
    "## Supporting files",
    ...ranked("supporting").slice(0, 25).map(line),
    "",
    `## Other files: ${ranked("skip").length} (tests, generated, assets, files that may hold secrets; not described)`,
    readme && `\n## README (start)\n${redactSecrets(readme.slice(0, 2500)).text}`,
  ];
  return parts.filter((p): p is string => typeof p === "string").join("\n");
}

// ------------------------------------------------------------------ file excerpts

/**
 * A file's text with 1-based line numbers, so the model can point at lines.
 * Long files are cut to their top and the start of each top-level definition.
 */
export function fileExcerpt(f: FileInfo, text: string, maxLines = 300): string {
  const lines = redactSecrets(text).text.split("\n");
  const num = (i: number) => `${String(i + 1).padStart(4)}| ${lines[i]}`;
  let keep: number[];
  if (lines.length <= maxLines) keep = lines.map((_, i) => i);
  else {
    const set = new Set<number>();
    for (let i = 0; i < Math.min(40, lines.length); i++) set.add(i);
    const per = Math.max(8, Math.floor((maxLines - 40) / Math.max(1, f.symbols.length)));
    for (const s of f.symbols) for (let i = s.line; i < Math.min(lines.length, s.line + per); i++) set.add(i);
    for (const r of f.routes) for (let i = r.line; i < Math.min(lines.length, r.line + 6); i++) set.add(i);
    keep = [...set].sort((a, b) => a - b).slice(0, maxLines + 40);
  }
  const out: string[] = [];
  let prev = -1;
  for (const i of keep) {
    if (prev >= 0 && i !== prev + 1) out.push("    | …");
    out.push(num(i));
    prev = i;
  }
  return `=== ${f.path} (${lines.length} lines${keep.length < lines.length ? ", excerpt" : ""}) ===\n${out.join("\n")}`;
}

// ------------------------------------------------------------------ what gets sent

export interface SendPlan {
  /** Files whose excerpts are sent, most important first. */
  files: string[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Picks the files to send, most important first, until the budget is used:
 * the index digest is sent with every call, excerpts once for summaries and
 * the most important again for the tour itself.
 */
export function planSend(index: RepoIndex, texts: Map<string, string | undefined>, budget: Budget, never: (path: string) => boolean = () => false): SendPlan {
  const limit = BUDGETS[budget];
  const digest = estimateTokens(indexDigest(index, index.readme ? texts.get(index.readme) : undefined));
  const order = ["start", "core", "supporting"] as const;
  const candidates = order.flatMap((b) =>
    index.files.filter((f) => f.bucket === b && f.kind === "source" && f.read && texts.get(f.path) !== undefined && !never(f.path)).sort((a, c) => c.score - a.score),
  );
  // Calls: summaries (about one per 12k tokens of excerpts), the overview, the tour. Each repeats the digest.
  let used = digest * 3 + 1500;
  const files: string[] = [];
  for (const f of candidates) {
    const cost = estimateTokens(fileExcerpt(f, texts.get(f.path)!));
    // Start and core files are read twice: once to summarize, once to write the tour.
    const times = f.bucket === "supporting" ? 1 : 2;
    const extra = cost * times + (files.length % 6 === 5 ? digest : 0); // every ~6 files is another summary call
    if (used + extra > limit && files.length >= 1) continue; // too big for what's left: try smaller files
    used += extra;
    files.push(f.path);
    if (files.length >= 40) break;
  }
  return { files, inputTokens: used, outputTokens: 800 + files.length * 350 + 6000 };
}
