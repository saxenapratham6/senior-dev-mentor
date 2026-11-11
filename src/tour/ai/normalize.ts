// Turns what the AI model wrote into a tour we can trust. The model may only
// talk about files and lines that exist: every stop must quote a piece of its
// line (the anchor), and a stop whose quote isn't in the file is moved to
// where it is, or dropped. All text goes through the guardrail.
import type { RepoIndex } from "../../repo/types";
import { guardExplanation, DEFAULT_GUARD, GuardOptions } from "../../guardrails";
import type { Chapter, Tour, TourStop } from "../tour";
import type { AiTour, FileSummaries, FileSummary, Overview } from "./schema";

export const AI_LIMITS = { chapters: 8, stops: 40, checksPerChapter: 3, explain: 700, deeper: 900, simpler: 500, bubble: 110, boxes: 8, arrows: 12, glossary: 10 };

export interface NormalizeReport {
  kept: number;
  moved: number; // anchor found on another line
  dropped: { path: string; why: string }[];
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Cut at a sentence end before `max` characters. */
export function clip(s: string, max: number): string {
  s = s.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "), cut.lastIndexOf(".\n"));
  return end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
}

/** The line (0-based) where `anchor` appears, nearest to `near`; undefined if it isn't in the file. */
export function findAnchor(lines: string[], anchor: string, near: number): number | undefined {
  const a = squash(anchor);
  if (a.length < 3) return undefined;
  let best: number | undefined;
  for (let i = 0; i < lines.length; i++) if (squash(lines[i]).includes(a) && (best === undefined || Math.abs(i - near) < Math.abs(best - near))) best = i;
  if (best !== undefined) return best;
  // An anchor may span two lines.
  for (let i = 0; i + 1 < lines.length; i++) if (squash(lines[i] + " " + lines[i + 1]).includes(a) && (best === undefined || Math.abs(i - near) < Math.abs(best - near))) best = i;
  return best;
}

export function normalizeAiTour(
  raw: AiTour,
  index: RepoIndex,
  texts: Map<string, string | undefined>,
  level: Tour["level"],
  guard: GuardOptions = DEFAULT_GUARD,
): { tour: Tour; report: NormalizeReport } {
  const report: NormalizeReport = { kept: 0, moved: 0, dropped: [] };
  const known = new Map(index.files.map((f) => [f.path, f]));
  const corpus = [...texts.values()].filter((t): t is string => t !== undefined);
  const text = (s: string, max: number) => clip(guardExplanation(s ?? "", corpus, guard).text.trim(), max);
  const chapters: Chapter[] = [];
  let total = 0;
  let n = 0;
  for (const c of (raw.chapters ?? []).slice(0, AI_LIMITS.chapters)) {
    const stops: TourStop[] = [];
    let checks = 0;
    for (const s of c.stops ?? []) {
      if (total >= AI_LIMITS.stops) break;
      const path = String(s.path ?? "").replace(/^\.?\//, "");
      const f = known.get(path);
      const body = texts.get(path);
      if (!f || body === undefined || !f.read || f.kind === "secret") {
        report.dropped.push({ path, why: f ? "not readable" : "no such file" });
        continue;
      }
      const lines = body.split("\n");
      const claimed = Math.max(0, Math.min(lines.length - 1, Math.round((s.line ?? 1) - 1)));
      const at = findAnchor(lines, s.anchor ?? "", claimed);
      if (at === undefined) {
        report.dropped.push({ path, why: `the quoted code isn't in the file: "${clip(s.anchor ?? "", 40)}"` });
        continue;
      }
      if (at !== claimed) report.moved++;
      const question = checks < AI_LIMITS.checksPerChapter ? text(s.checkQuestion, 300) : "";
      if (question) checks++;
      stops.push({
        id: `a${++n}`,
        path,
        line: at,
        title: path.slice(path.lastIndexOf("/") + 1),
        bubble: text(s.bubble || s.explain, AI_LIMITS.bubble).replace(/\n+/g, " "),
        note: text(s.explain, AI_LIMITS.explain) || "(no explanation)",
        simpler: text(s.simpler, AI_LIMITS.simpler) || undefined,
        deeper: text(s.deeper, AI_LIMITS.deeper) || undefined,
        check: question ? { question, answer: text(s.checkAnswer, 500) } : undefined,
      });
      total++;
      report.kept++;
    }
    if (stops.length) chapters.push({ id: `ai${chapters.length + 1}`, title: clip(c.title || "Next", 60), why: text(c.why, 200), stops });
  }
  return { tour: { kind: "repo", level, title: `Tour of ${index.name}`, chapters, quiz: [] }, report };
}

/** Keeps only boxes that point at real files and arrows between real boxes. */
export function normalizeOverview(raw: Overview, index: RepoIndex, texts: Map<string, string | undefined>, guard: GuardOptions = DEFAULT_GUARD): Overview {
  const known = new Set(index.files.filter((f) => f.kind !== "secret").map((f) => f.path));
  const corpus = [...texts.values()].filter((t): t is string => t !== undefined);
  const text = (s: string, max: number) => clip(guardExplanation(s ?? "", corpus, guard).text.trim(), max);
  const boxes = (raw.architecture?.boxes ?? [])
    .map((b) => ({ id: String(b.id).slice(0, 40), label: clip(b.label ?? "", 40), what: text(b.what, 200), files: (b.files ?? []).map((p) => p.replace(/^\.?\//, "")).filter((p) => known.has(p)).slice(0, 8) }))
    .filter((b, i, all) => b.id && b.label && all.findIndex((x) => x.id === b.id) === i)
    .slice(0, AI_LIMITS.boxes);
  const ids = new Set(boxes.map((b) => b.id));
  const arrows = (raw.architecture?.arrows ?? [])
    .filter((a) => ids.has(a.from) && ids.has(a.to) && a.from !== a.to)
    .map((a) => ({ from: a.from, to: a.to, label: clip(a.label ?? "", 40) }))
    .slice(0, AI_LIMITS.arrows);
  return {
    purpose: text(raw.purpose, 400),
    users: text(raw.users, 300),
    howItWorks: text(raw.howItWorks, 900),
    architecture: { boxes, arrows },
    glossary: (raw.glossary ?? []).map((g) => ({ term: clip(g.term ?? "", 40), meaning: text(g.meaning, 240) })).filter((g) => g.term && g.meaning).slice(0, AI_LIMITS.glossary),
  };
}

/** Drops summaries of files we didn't send, and parts whose lines don't exist. */
export function normalizeSummaries(raw: FileSummaries, sent: Set<string>, texts: Map<string, string | undefined>): FileSummary[] {
  const out: FileSummary[] = [];
  for (const f of raw.files ?? []) {
    const path = String(f.path ?? "").replace(/^\.?\//, "");
    const body = texts.get(path);
    if (!sent.has(path) || body === undefined) continue;
    const lines = body.split("\n").length;
    out.push({
      path,
      purpose: clip(f.purpose ?? "", 300),
      parts: (f.parts ?? []).filter((p) => p.line >= 1 && p.line <= lines).slice(0, 8).map((p) => ({ name: clip(p.name, 60), line: p.line, what: clip(p.what, 200) })),
      notable: (f.notable ?? []).filter((p) => p.line >= 1 && p.line <= lines).slice(0, 5).map((p) => ({ line: p.line, anchor: clip(p.anchor, 80), why: clip(p.why, 200) })),
    });
  }
  return out;
}
