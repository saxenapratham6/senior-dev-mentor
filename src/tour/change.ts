// "I need to change something": finds the files a task touches, where to start
// in each, what else depends on them, and which tests to run afterwards. It
// points at code; it never writes the change.
import type { FileInfo, RepoIndex } from "../repo/types";
import { basename } from "../repo/files";
import { words } from "./trace";
import type { Level, Tour, TourStop } from "./tour";

export interface ChangeCandidate {
  path: string;
  line: number; // 0-based: the best line to start reading
  score: number;
  why: string[];
}

const list = (xs: string[], max = 3) => {
  const shown = xs.slice(0, max).map((x) => `\`${x}\``);
  return xs.length > max ? `${shown.join(", ")} and ${xs.length - max} more` : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : (shown[0] ?? "");
};

/** Files that look related to the task, best first, each with the line to start at and why. */
export function changeCandidates(index: RepoIndex, texts: Map<string, string | undefined>, task: string): ChangeCandidate[] {
  const q = [...new Set(words(task))];
  if (!q.length) return [];
  const out: ChangeCandidate[] = [];
  for (const f of index.files) {
    if (f.kind !== "source" || !f.read) continue;
    const text = texts.get(f.path) ?? "";
    const why: string[] = [];
    let score = 0;
    const pathHits = q.filter((w) => words(f.path).includes(w));
    if (pathHits.length) {
      score += pathHits.length * 4;
      why.push(`its name mentions ${pathHits.join(", ")}`);
    }
    const symHits = f.symbols.filter((s) => words(s.name).some((w) => q.includes(w)));
    if (symHits.length) {
      score += Math.min(3, symHits.length) * 3;
      why.push(`defines ${symHits.slice(0, 3).map((s) => `\`${s.name}\``).join(", ")}`);
    }
    const routeHits = f.routes.filter((r) => words(r.path).some((w) => q.includes(w)));
    if (routeHits.length) {
      score += routeHits.length * 4;
      why.push(`answers ${routeHits.slice(0, 3).map((r) => `\`${r.method} ${r.path}\``).join(", ")}`);
    }
    if (f.doc && words(f.doc).some((w) => q.includes(w))) {
      score += 2;
      why.push("its top comment is about this");
    }
    // Mentions in the code itself count a little, and less in very long files.
    const lower = text.toLowerCase();
    const mentions = q.reduce((n, w) => n + Math.min(10, lower.split(w).length - 1), 0);
    if (mentions) score += Math.min(4, mentions / Math.max(1, Math.log2(f.lines / 50 + 2)));
    if (!score || (!why.length && mentions < 3)) continue;
    if (!why.length) why.push(`mentions ${q.filter((w) => lower.includes(w)).join(", ")} ${mentions} times`);
    score += f.bucket === "start" || f.bucket === "core" ? 1 : 0;
    out.push({ path: f.path, line: bestLine(f, text, q), score, why });
  }
  return out.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 8);
}

/** The line to start reading: a matching route or definition, else the line with the most matching words. */
function bestLine(f: FileInfo, text: string, q: string[]): number {
  const route = f.routes.find((r) => words(r.path).some((w) => q.includes(w)));
  if (route) return route.line;
  const sym = f.symbols.find((s) => words(s.name).some((w) => q.includes(w)));
  if (sym) return sym.line;
  const lines = text.split("\n");
  let best = 0;
  let bestN = 0;
  lines.forEach((l, i) => {
    const n = q.filter((w) => l.toLowerCase().includes(w)).length;
    if (n > bestN) [best, bestN] = [i, n];
  });
  return best;
}

export function buildChangeTour(index: RepoIndex, texts: Map<string, string | undefined>, task: string, level: Level): Tour {
  const found = changeCandidates(index, texts, task).slice(0, level === "new" ? 5 : 4);
  const files = new Map(index.files.map((f) => [f.path, f]));
  const title = `Changing: ${task.trim().replace(/\.$/, "")}`;
  if (!found.length)
    return { kind: "change", level, title, message: "I couldn't find code about that by name. Try the words the code would use (like \"login\" or \"price\"), or have the AI read the repo for it.", chapters: [], quiz: [] };
  const stops: TourStop[] = found.map((c, i) => {
    const f = files.get(c.path)!;
    const users = f.importedBy.filter((p) => files.get(p)?.kind === "source");
    const tests = f.importedBy.filter((p) => files.get(p)?.kind === "test");
    const sym = f.symbols.find((s) => s.line === c.line);
    const affected = sym?.usedBy?.length ? sym.usedBy : users;
    const beginner = level === "new";
    return {
      id: `c${i + 1}`,
      path: c.path,
      line: c.line,
      title: basename(c.path),
      bubble: i === 0 ? "I'd start reading here." : `This one is involved too.`,
      note: [
        `${i === 0 ? "**Start here.** " : ""}\`${c.path}\` ${c.why.join("; ")}.`,
        sym ? `Read \`${sym.name}\` (line ${sym.line + 1}) first and say in one sentence what it does today.` : `Line ${c.line + 1} is where it comes up most.`,
        affected.length ? `If you change it, check ${list(affected)} too: ${affected.length === 1 ? "it uses" : "they use"} this.` : "",
        tests.length ? `Afterwards, run the tests in ${list(tests)}.` : beginner ? "No test covers this file yet. How will you check your change works?" : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  });
  return {
    kind: "change",
    level,
    title,
    chapters: [{ id: "change", title: "Where your change goes", why: "Most likely first. Read before you write.", stops }],
    quiz: [{ q: "Before you write any code: what exactly will be different when you're done, and how will you check it?", a: "Write it down in one or two sentences. That's your plan; press **Plan** in the Mentor panel to have it checked." }],
  };
}
