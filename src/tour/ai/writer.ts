// Writes a repo tour with an AI model, in three steps:
//   1. summarize the important files (in batches, in parallel, cached by content),
//   2. write an overview with an architecture diagram,
//   3. write the tour itself, which is then checked against the real files.
// The repo digest is the shared system prompt of every call, so it's cached.
import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import type { RepoIndex } from "../../repo/types";
import type { MentorProvider } from "../../providers/types";
import type { GuardOptions } from "../../guardrails";
import { buildRepoTour, flatStops, Level, Tour } from "../tour";
import { AiTourSchema, AiTour, FileSummariesSchema, FileSummaries, FileSummary, OverviewSchema, Overview } from "./schema";
import { Budget, estimateTokens, fileExcerpt, indexDigest, planSend } from "./digest";
import { normalizeAiTour, normalizeOverview, normalizeSummaries } from "./normalize";

/** Bump when a prompt changes, so cached summaries written by the old prompt are redone. */
export const PROMPT_VERSION = 1;
const BATCH_TOKENS = 12_000;
const PARALLEL = 4;

// ------------------------------------------------------------------ prompts

const ROLE = `You are a senior software engineer showing a newcomer around a codebase, the way a good teammate does on someone's first day. You explain what code is for and how the parts connect. You never invent files, functions or behavior: everything you say must be supported by the repository index and the code excerpts you are given. When the excerpts don't show something, say less rather than guess.`;

export function summaryPrompt(digest: string): string {
  return `${ROLE}

Below is an index of the repository, worked out by reading the code (not by an AI). Then you'll get numbered excerpts of some files.

For each excerpt, write:
- purpose: one or two plain sentences on what the file is for and why it exists.
- parts: its main functions, classes or sections, each with the 1-based line number where it starts (as numbered) and one sentence on what it does.
- notable: up to 4 lines worth pointing at when teaching this file, each with its line number, an "anchor" (a short piece of that exact line, copied character for character, 10 to 60 characters), and why it matters.

Only describe files you were given. Return one entry per file, using its path exactly as shown.

${digest}`;
}

export function overviewPrompt(digest: string): string {
  return `${ROLE}

Below is an index of the repository. You'll get summaries of its most important files. Write:
- purpose: what the project is for, in two or three plain sentences.
- users: who uses it and how (a person in a browser, a developer calling a library, a command in a terminal…).
- howItWorks: the path one typical request, command or event takes through the code, naming the files in order. Four to six sentences.
- architecture: 3 to 7 boxes for the main parts (each with a short id, a label of at most 4 words, one sentence on what it does, and the repo paths of the files that make it up), and arrows between them labeled with what flows (for example "HTTP request", "SQL query", "calls"). Include outside things the code talks to, like "Browser" or "PostgreSQL", as boxes with no files.
- glossary: up to 8 terms a newcomer will meet in this repo (only terms that really appear), each with a one-sentence meaning.

${digest}`;
}

export function tourPrompt(digest: string, level: Level): string {
  const voice =
    level === "new"
      ? `The reader is NEW to this: maybe their first real codebase, maybe a new language. Use plain words, explain any term the first time it appears, use a small analogy when it helps, and keep each explanation to 2-4 short sentences. Ask a check question at about every second stop.`
      : `The reader is EXPERIENCED. Be dense and precise: name patterns, data flow and design decisions, skip basics, 1-3 sentences per stop. Ask a check question only where it tests real understanding (about one per chapter).`;
  return `${ROLE}

Write a guided tour of this repository. A little panda will walk to each stop in the reader's editor and say the "bubble" text; the "explain" text shows beside the code.

${voice}

Shape of the tour:
1. "The big picture": one stop at the README or the main entry point, on what the project does.
2. "Where it starts": the entry point(s), at the exact line where things begin.
3. One feature end to end: follow one central request, command or event through the files in the order it travels.
4. The rest of the core: the other important files, one stop each at the line that matters most.
5. "How it's run and tested": the run/build scripts and one test.
Use 8 to 15 stops in total for a new reader, 5 to 10 for an experienced one. Chapter titles are short.

Every stop must have:
- path: a file path exactly as in the index.
- line: the 1-based line number as numbered in the excerpts.
- anchor: a short piece of THAT line copied character for character (10 to 60 characters). Stops whose anchor isn't found in the file are thrown away, so copy it exactly.
- bubble: one sentence of at most 15 words, for the speech bubble.
- explain: the explanation at this stop.
- simpler: the same idea for someone who found "explain" too hard (no jargon, an everyday analogy).
- deeper: what an experienced engineer would add: design choices, trade-offs, what to watch out for.
- checkQuestion and checkAnswer: a question that checks understanding (or two empty strings). Never ask the reader to write code.

Never write new code or fixes. You may mention short names from the code in \`backticks\`.

${digest}`;
}

// ------------------------------------------------------------------ cache

/** Summaries cached on disk by file content, prompt version and model. */
export class SummaryCache {
  private data = new Map<string, FileSummary>();
  private loaded = false;
  constructor(private readonly file?: string) {}

  static key(text: string, model: string): string {
    return createHash("sha1").update(`${PROMPT_VERSION}\0${model}\0${text}`).digest("hex");
  }

  async load(): Promise<void> {
    if (this.loaded || !this.file) return;
    this.loaded = true;
    try {
      const raw = JSON.parse(await fs.readFile(this.file, "utf8")) as Record<string, FileSummary>;
      for (const [k, v] of Object.entries(raw)) this.data.set(k, v);
    } catch {
      // first time
    }
  }

  get(key: string): FileSummary | undefined {
    return this.data.get(key);
  }

  set(key: string, value: FileSummary): void {
    this.data.set(key, value);
  }

  async save(): Promise<void> {
    if (!this.file) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(Object.fromEntries(this.data)));
  }
}

// ------------------------------------------------------------------ the writer

export interface WriteOptions {
  index: RepoIndex;
  texts: Map<string, string | undefined>;
  provider: MentorProvider;
  model: string; // for the cache key
  level: Level;
  budget: Budget;
  never?: (path: string) => boolean; // .mentorignore
  cache: SummaryCache;
  guard?: GuardOptions;
  signal: AbortSignal;
  onProgress?: (text: string) => void;
}

export interface WriteResult {
  tour: Tour;
  summaries: FileSummary[];
  overview: Overview;
  sentFiles: string[];
  calls: number;
  cachedFiles: number;
}

export async function writeAiTour(o: WriteOptions): Promise<WriteResult> {
  const { index, texts, provider, signal } = o;
  const plan = planSend(index, texts, o.budget, o.never);
  if (!plan.files.length) throw new Error("There's no code here I can read, so there's nothing to tour.");
  const digest = indexDigest(index, index.readme ? texts.get(index.readme) : undefined);
  const info = new Map(index.files.map((f) => [f.path, f]));
  const excerpt = (p: string) => fileExcerpt(info.get(p)!, texts.get(p)!);
  let calls = 0;

  // 1. Summaries: cached ones first, the rest in batches.
  await o.cache.load();
  const summaries = new Map<string, FileSummary>();
  const todo: string[] = [];
  for (const p of plan.files) {
    const hit = o.cache.get(SummaryCache.key(texts.get(p)!, o.model));
    if (hit) summaries.set(p, { ...hit, path: p });
    else todo.push(p);
  }
  const cachedFiles = summaries.size;
  const batches: string[][] = [];
  let cur: string[] = [];
  let size = 0;
  for (const p of todo) {
    const t = estimateTokens(excerpt(p));
    if (cur.length && size + t > BATCH_TOKENS) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(p);
    size += t;
  }
  if (cur.length) batches.push(cur);
  let done = 0;
  const system = summaryPrompt(digest);
  await inParallel(batches, PARALLEL, async (batch) => {
    o.onProgress?.(`Reading ${batch.length === 1 ? batch[0] : `${batch.length} files`}… (${done}/${todo.length} read)`);
    calls++;
    const raw = (await provider.json(system, batch.map(excerpt).join("\n\n"), FileSummariesSchema, signal, { effort: "low", cacheSystem: true, what: "file summary" })) as FileSummaries;
    for (const s of normalizeSummaries(raw, new Set(batch), texts)) {
      summaries.set(s.path, s);
      o.cache.set(SummaryCache.key(texts.get(s.path)!, o.model), s);
    }
    done += batch.length;
  });
  await o.cache.save();
  const ordered = plan.files.map((p) => summaries.get(p)).filter((s): s is FileSummary => !!s);
  const summaryText = ordered
    .map((s) => `### ${s.path}\n${s.purpose}\n${s.parts.map((p) => `- ${p.name} (line ${p.line}): ${p.what}`).join("\n")}${s.notable.length ? `\nNotable: ${s.notable.map((n) => `line ${n.line} "${n.anchor}": ${n.why}`).join("; ")}` : ""}`)
    .join("\n\n");

  // 2. Overview and architecture.
  o.onProgress?.("Drawing the big picture…");
  calls++;
  const rawOverview = (await provider.json(overviewPrompt(digest), `Summaries of the most important files:\n\n${summaryText}`, OverviewSchema, signal, { effort: "medium", cacheSystem: true, what: "overview" })) as Overview;
  const overview = normalizeOverview(rawOverview, index, texts, o.guard);

  // 3. The tour: the summaries, the no-AI tour as a starting point, and the code of the files that matter most.
  o.onProgress?.("Planning the tour…");
  const skeleton = flatStops(buildRepoTour(index, o.level)).map((s) => `- ${s.path}:${s.line + 1} (${s.title})`).join("\n");
  const important = plan.files.filter((p) => ["start", "core"].includes(info.get(p)!.bucket));
  const user = [
    `Overview you wrote:\n${overview.purpose}\n${overview.howItWorks}`,
    `File summaries:\n\n${summaryText}`,
    `A tour worked out without AI, as a starting point (improve on it):\n${skeleton}`,
    `Code of the most important files, numbered:\n\n${important.map(excerpt).join("\n\n")}`,
  ].join("\n\n---\n\n");
  calls++;
  const rawTour = (await provider.json(tourPrompt(digest, o.level), user, AiTourSchema, signal, { effort: "medium", cacheSystem: true, what: "tour" })) as AiTour;
  const { tour, report } = normalizeAiTour(rawTour, index, texts, o.level, o.guard);
  if (flatStops(tour).length < 2) throw new Error("The AI's tour pointed at code that isn't in your files, so I threw it away. Try again, or use the tour I worked out myself.");
  tour.ai = { label: provider.label, overview, files: plan.files.length, checked: { kept: report.kept, moved: report.moved, dropped: report.dropped.length } };
  tour.quiz = flatStops(tour).filter((s) => s.check).slice(0, 6).map((s) => ({ q: s.check!.question, a: s.check!.answer }));
  return { tour, summaries: ordered, overview, sentFiles: plan.files, calls, cachedFiles };
}

async function inParallel<T>(items: T[], width: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}
