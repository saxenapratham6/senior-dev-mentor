// What the board shows for a repo and a tour: plain data, built from the index.
import type { FileInfo, RepoIndex } from "../repo/types";
import type { RepoView, TourView } from "../board";
import type { Tour } from "./tour";

const row = (f: FileInfo) => ({ path: f.path, role: f.role, reasons: f.reasons, score: f.score, line: f.entry?.line ?? f.main?.line ?? 0 });

export function repoView(index: RepoIndex): RepoView {
  const by = (b: string) => index.files.filter((f) => f.bucket === b).sort((a, c) => c.score - a.score);
  const skip = new Map<string, string[]>();
  for (const f of by("skip")) skip.set(f.skipWhy ?? "", [...(skip.get(f.skipWhy ?? "") ?? []), f.path]);
  const lines = index.languages.reduce((n, l) => n + l.lines, 0);
  return {
    name: index.name,
    description: index.description,
    files: index.files.length,
    read: index.files.filter((f) => f.read).length,
    secrets: index.files.filter((f) => f.kind === "secret").length,
    lines,
    truncated: index.truncated,
    languages: index.languages.slice(0, 5).map((l) => ({ name: l.name, share: lines ? Math.round((100 * l.lines) / lines) : 0 })),
    frameworks: index.frameworks.map((f) => ({ name: f.name, what: f.what })),
    start: by("start").map(row),
    core: by("core").map(row),
    supporting: by("supporting").slice(0, 20).map(row),
    supportingMore: Math.max(0, by("supporting").length - 20),
    skip: [...skip.entries()].map(([why, paths]) => ({ why, count: paths.length, examples: paths.slice(0, 4) })).sort((a, b) => b.count - a.count),
    folders: index.folders,
  };
}

export function tourView(tour: Tour): TourView {
  let i = 0;
  return {
    title: tour.title,
    kind: tour.kind,
    message: tour.message,
    chapters: tour.chapters.map((c) => ({
      title: c.title,
      why: c.why,
      stops: c.stops.map((s) => ({ index: i++, title: s.title, path: s.path, line: s.line, bubble: s.bubble, note: s.note, simpler: s.simpler, deeper: s.deeper, check: s.check })),
    })),
    quiz: tour.quiz,
    ai: tour.ai,
  };
}
