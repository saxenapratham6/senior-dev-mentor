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
import { AiTourSchema, AiTour, AiTraceSchema, AiTrace, FileSummariesSchema, FileSummaries, FileSummary, OverviewSchema, Overview } from "./schema";
import { findAnchor, clip } from "./normalize";
import { guardExplanation } from "../../guardrails";
import { traceTour, TraceStart, TraceStep, Sequence } from "../trace";
import { basename } from "../../repo/files";
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

export function changePrompt(digest: string, level: Level, task: string): string {
  return `${ROLE}

The reader wants to make this change: "${task}"

Write a short tour of ONLY the code this change touches, in the order they should read it: where to start, what else is affected (callers, data shapes, templates, tests), and how they will check it works. ${level === "new" ? "They are new to this: plain words, explain terms." : "They are experienced: be brief and precise."} 3 to 7 stops, one chapter titled "Where your change goes".

Never write the change, a fix, or any new code. Point, explain what the code does today, and ask what they plan to do. Each stop has the same fields as a tour stop: path, 1-based line as numbered, an exact anchor from that line, bubble, explain, simpler, deeper, checkQuestion and checkAnswer. A good checkQuestion here asks what they will change at this spot, or what could break.

${digest}`;
}

export function tracePrompt(digest: string, level: Level): string {
  return `${ROLE}

The reader asked what happens in the code when something happens. Follow it step by step, in the order the code runs, from where it starts (a route, a command, an event) through each function in another file it calls, to where it ends (a response, a database, a file). ${level === "new" ? "They are new to this: plain words, one or two sentences per step." : "They are experienced: precise and brief."}

For each step: path, the 1-based line as numbered in the excerpts, an anchor (a short piece of that exact line, 10 to 60 characters), actor (a 1-3 word name for who acts here, the same name each time the same file acts), calledBy (the actor that hands over to this step, or the "outside" starter for the first step), handsOver (what is passed, 1-4 words), bubble (at most 15 words) and explain. 3 to 9 steps. Only include steps you can see in the excerpts. Never write new code.

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

export interface Goal {
  kind: "change";
  task: string;
  /** Files the no-AI search found, sent first. */
  candidates: string[];
}

export interface WriteOptions {
  goal?: Goal;
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
  const plan = planSend(index, texts, o.budget, o.never, o.goal?.candidates);
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
  const skeleton = o.goal
    ? o.goal.candidates.map((p) => `- ${p}`).join("\n")
    : flatStops(buildRepoTour(index, o.level)).map((s) => `- ${s.path}:${s.line + 1} (${s.title})`).join("\n");
  const important = o.goal ? plan.files.filter((p) => o.goal!.candidates.includes(p)).slice(0, 6) : plan.files.filter((p) => ["start", "core"].includes(info.get(p)!.bucket));
  const user = [
    `Overview you wrote:\n${overview.purpose}\n${overview.howItWorks}`,
    `File summaries:\n\n${summaryText}`,
    o.goal ? `Files a keyword search found for this change (it may have missed some, or included some that don't matter):\n${skeleton}` : `A tour worked out without AI, as a starting point (improve on it):\n${skeleton}`,
    `Code of the most important files, numbered:\n\n${important.map(excerpt).join("\n\n")}`,
  ].join("\n\n---\n\n");
  calls++;
  const prompt = o.goal ? changePrompt(digest, o.level, o.goal.task) : tourPrompt(digest, o.level);
  const rawTour = (await provider.json(prompt, user, AiTourSchema, signal, { effort: "medium", cacheSystem: true, what: "tour" })) as AiTour;
  const { tour, report } = normalizeAiTour(rawTour, index, texts, o.level, o.guard);
  if (o.goal) {
    tour.kind = "change";
    tour.title = `Changing: ${o.goal.task.trim().replace(/\.$/, "")}`;
  }
  if (flatStops(tour).length < 2) throw new Error("The AI's tour pointed at code that isn't in your files, so I threw it away. Try again, or use the tour I worked out myself.");
  tour.ai = { label: provider.label, overview, files: plan.files.length, checked: { kept: report.kept, moved: report.moved, dropped: report.dropped.length } };
  tour.quiz = flatStops(tour).filter((s) => s.check).slice(0, 6).map((s) => ({ q: s.check!.question, a: s.check!.answer }));
  return { tour, summaries: ordered, overview, sentFiles: plan.files, calls, cachedFiles };
}

// ------------------------------------------------------------------ a trace, with AI

export interface TraceOptions {
  index: RepoIndex;
  texts: Map<string, string | undefined>;
  provider: MentorProvider;
  level: Level;
  question: string;
  start?: TraceStart;
  /** The no-AI trace, sent as a starting point. */
  steps: TraceStep[];
  never?: (path: string) => boolean;
  guard?: GuardOptions;
  signal: AbortSignal;
}

/** One call: the question, the no-AI trace and the code of the files along it. */
export async function writeAiTrace(o: TraceOptions): Promise<Tour> {
  const { index, texts } = o;
  const info = new Map(index.files.map((f) => [f.path, f]));
  const along = [...new Set(o.steps.map((s) => s.path))];
  // The files on the path, then what they import, while it fits.
  const near = [...along, ...along.flatMap((p) => info.get(p)?.imports ?? [])].filter((p, i, all) => all.indexOf(p) === i && !o.never?.(p) && texts.get(p) !== undefined && info.get(p)?.kind === "source");
  let size = 0;
  const sent: string[] = [];
  for (const p of near) {
    const t = estimateTokens(fileExcerpt(info.get(p)!, texts.get(p)!));
    if (sent.length && size + t > 30_000) continue;
    sent.push(p);
    size += t;
  }
  if (!sent.length) {
    // Nothing found without AI: send the entry points and core files instead.
    for (const f of index.files.filter((x) => (x.bucket === "start" || x.bucket === "core") && x.read && !o.never?.(x.path)).slice(0, 8)) sent.push(f.path);
  }
  const user = [
    `Question: what happens when ${o.question}?`,
    o.start ? `It probably starts at ${o.start.label} (${o.start.path}, line ${o.start.line + 1}).` : "",
    o.steps.length ? `A trace worked out without AI (follows imports, may be incomplete):\n${o.steps.map((s) => `- ${s.path}:${s.line + 1} ${s.actor}`).join("\n")}` : "",
    `Code, numbered:\n\n${sent.map((p) => fileExcerpt(info.get(p)!, texts.get(p)!)).join("\n\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
  const digest = indexDigest(index, index.readme ? texts.get(index.readme) : undefined);
  const raw = (await o.provider.json(tracePrompt(digest, o.level), user, AiTraceSchema, o.signal, { effort: "medium", cacheSystem: true, what: "trace" })) as AiTrace;
  const corpus = [...texts.values()].filter((t): t is string => t !== undefined);
  const text = (s: string, max: number) => clip(guardExplanation(s ?? "", corpus, o.guard).text.trim(), max);
  const steps: TraceStep[] = [];
  const outside = clip(raw.outside || "Outside", 24);
  const messages: Sequence["messages"] = [];
  const actors = [outside];
  let dropped = 0;
  for (const s of (raw.steps ?? []).slice(0, 12)) {
    const path = String(s.path ?? "").replace(/^\.?\//, "");
    const body = texts.get(path);
    const f = info.get(path);
    if (!f || body === undefined || f.kind === "secret") {
      dropped++;
      continue;
    }
    const lines = body.split("\n");
    const at = findAnchor(lines, s.anchor ?? "", Math.max(0, (s.line ?? 1) - 1));
    if (at === undefined) {
      dropped++;
      continue;
    }
    const actor = clip(s.actor || basename(path), 24);
    const from = actors.includes(clip(s.calledBy ?? "", 24)) ? clip(s.calledBy, 24) : (steps.length ? steps[steps.length - 1].actor : outside);
    if (!actors.includes(actor)) actors.push(actor);
    messages.push({ from, to: actor, label: clip(s.handsOver || basename(path), 30), stop: steps.length });
    steps.push({ path, line: at, actor, what: text(s.explain, 700), bubble: text(s.bubble, 110).replace(/\n+/g, " ") });
  }
  if (steps.length < 2) throw new Error("The AI's trace pointed at code that isn't in your files, so I threw it away. The trace I worked out myself is still on the board.");
  const end = clip(raw.endsAt ?? "", 24);
  if (end && !actors.includes(end)) {
    actors.push(end);
    messages.push({ from: steps[steps.length - 1].actor, to: end, label: "", stop: steps.length - 1 });
  }
  return traceTour(o.question, steps, { question: o.question, actors, messages }, o.level, {
    label: o.provider.label,
    files: sent.length,
    checked: { kept: steps.length, moved: 0, dropped },
    overview: { purpose: "", users: "", howItWorks: "", architecture: { boxes: [], arrows: [] }, glossary: [] },
  });
}

async function inParallel<T>(items: T[], width: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}
