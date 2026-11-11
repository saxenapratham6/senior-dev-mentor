// "Follow what happens when…": a request, command or event traced through the
// code, file by file. Worked out without AI by following what each step's code
// uses from the repo's other files; an AI model can refine it (see ai/trace.ts).
import type { FileInfo, RepoIndex } from "../repo/types";
import { basename } from "../repo/files";
import type { Level, Tour, TourStop } from "./tour";

export interface TraceStart {
  label: string; // "POST /add", "npm start", "init_db()"
  path: string;
  line: number; // 0-based
  kind: "route" | "entry" | "symbol";
}

export interface TraceStep {
  path: string;
  from?: string; // the step (path) that uses this one
  line: number; // 0-based
  actor: string; // who acts at this step, for the sequence diagram
  what: string; // Markdown, one or two sentences
  bubble: string;
}

export interface Sequence {
  question: string;
  actors: string[];
  messages: { from: string; to: string; label: string; stop: number }[];
}

const STOP_WORDS = new Set("a an the when what happens how does do i my is are to of in on for and or with user users someone you it this that".split(" "));
const DB_LIBS = /^(pg|mysql2?|sqlite3|better-sqlite3|mongoose|mongodb|@prisma\/client|prisma|sequelize|typeorm|knex|redis|ioredis|sqlalchemy|flask[-_]sqlalchemy|psycopg2?|pymongo|django)$/;

/** Words of a question or name: "signUp_user /api/sign-up" → sign, up, user, api. */
export function words(s: string): string[] {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .map((w) => w.replace(/(ing|ed)$/, "") || w)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

const METHOD_WORDS: Record<string, string[]> = {
  POST: ["add", "create", "submit", "send", "post", "sign", "signup", "register", "login", "log", "upload", "save", "new", "make"],
  GET: ["get", "show", "list", "load", "view", "open", "see", "read", "fetch", "visit", "page", "home", "index", "search", "find"],
  DELETE: ["delete", "remove", "destroy", "clear"],
  PUT: ["update", "edit", "change", "rename", "replace"],
  PATCH: ["update", "edit", "change", "toggle", "done", "finish", "complete", "mark"],
};

/** Where a trace could start, best match for the question first. With no question: every route and entry point. */
export function traceStarts(index: RepoIndex, question = "", texts?: Map<string, string | undefined>): TraceStart[] {
  const q = new Set(words(question));
  const out: (TraceStart & { score: number })[] = [];
  const useful = index.files.filter((f) => f.kind === "source" && f.bucket !== "skip");
  const prefixes = mountPrefixes(index, texts);
  for (const f of useful) {
    for (const r of f.routes) {
      if (r.method === "USE" && f.routes.some((x) => x.method !== "USE")) continue;
      const full = joinUrl(prefixes.get(f.path) ?? "", r.path);
      const pathWords = words(full);
      let score = pathWords.filter((w) => q.has(w)).length * 3;
      score += (METHOD_WORDS[r.method] ?? []).filter((w) => q.has(w)).length;
      if (!q.size) score = 1;
      if (r.path === "/" && [...q].some((w) => ["home", "index", "open", "visit", "load", "page"].includes(w))) score += 3;
      if (pathWords.length && q.size) score += pathWords.filter((w) => q.has(w)).length / pathWords.length; // "/add" fits "adds a todo" better than "/done/<int:todo_id>"
      if (r.method === "USE") score *= 0.5; // a whole router mounted here: the real handlers are elsewhere
      out.push({ label: `${r.method} ${full}`, path: f.path, line: r.line, kind: "route", score });
    }
    if (f.entry && f.bucket === "start") {
      const score = !q.size ? 1 : [...q].some((w) => ["start", "run", "launch", "boot", "open", "begin", "startup"].includes(w)) ? 4 : 0.5;
      out.push({ label: `start: ${basename(f.path)}`, path: f.path, line: f.entry.line, kind: "entry", score });
    }
    if (q.size)
      for (const s of f.symbols) {
        const hit = words(s.name).filter((w) => q.has(w)).length;
        if (hit) out.push({ label: `${s.name}()`, path: f.path, line: s.line, kind: "symbol", score: hit * 2 + (s.usedBy?.length ? 0.5 : 0) });
      }
  }
  return out
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || (a.kind === "route" ? -1 : 1))
    .filter((c, i, all) => all.findIndex((x) => x.label === c.label && x.path === c.path) === i)
    .slice(0, 8)
    .map(({ score: _s, ...c }) => c);
}

const joinUrl = (a: string, b: string) => (a ? `${a.replace(/\/$/, "")}${b === "/" ? "" : b}` || "/" : b);

/** Express-style `app.use("/api/notes", notes)`: the router file `notes` answers under /api/notes. */
function mountPrefixes(index: RepoIndex, texts?: Map<string, string | undefined>): Map<string, string> {
  const out = new Map<string, string>();
  const files = new Map(index.files.map((f) => [f.path, f]));
  for (const f of index.files)
    for (const r of f.routes) {
      if (r.method !== "USE") continue;
      for (const dep of f.imports) {
        const d = files.get(dep);
        if (d?.routes.some((x) => x.method !== "USE")) {
          const name = stem(dep).replace(/[^\w]/g, "");
          // The mounting line names the router's variable, which is usually the file's name.
          const line = texts?.get(f.path)?.split("\n")[r.line] ?? "";
          if (name && new RegExp(`\\b${name}\\b`).test(line.slice(line.indexOf(r.path) + r.path.length))) out.set(dep, r.path);
        }
      }
    }
  return out;
}

/** Who acts in a file, for the sequence diagram. */
export function actorOf(f: FileInfo): string {
  const p = f.path.toLowerCase();
  if (/(^|\/)(models?|schemas?)(\.|\/)/.test(p)) return "Model";
  if (/(^|\/)(db|database|repository|repo|store|dao)(\.|\/)/.test(p)) return "Data layer";
  if (/(^|\/)(routes?|router|controllers?|views?|handlers?|api)(\.|\/)/.test(p) || f.routes.length) return f.entry ? "App" : "Routes";
  if (/(^|\/)(services?)(\.|\/)/.test(p)) return "Service";
  if (/(^|\/)(utils?|helpers?|lib)(\.|\/)/.test(p)) return "Helpers";
  if (/(^|\/)(components?)\//.test(p)) return "Component";
  if (/(^|\/)hooks\//.test(p)) return "Hook";
  if (f.entry) return "App";
  return basename(f.path).replace(/\.\w+$/, "");
}

/** The lines of a definition starting at `line`: up to the next top-level definition. */
function region(f: FileInfo, lines: string[], line: number): [number, number] {
  if (f.entry && line === f.entry.line && f.bucket === "start" && !f.routes.some((r) => r.line === line)) return [0, lines.length];
  // A decorator (@app.route) sits just above the function it belongs to.
  const def = f.symbols.find((s) => s.line >= line && s.line <= line + 3)?.line ?? line;
  const next = f.symbols.map((s) => s.line).filter((l) => l > def).sort((a, b) => a - b)[0];
  const routeNext = f.routes.map((r) => r.line).filter((l) => l > line).sort((a, b) => a - b)[0];
  const end = Math.min(next ?? lines.length, routeNext ?? lines.length, line + 60);
  return [line, end];
}

const stem = (p: string) => basename(p).replace(/\.\w+$/, "").replace(/^index$/, basename(p.slice(0, p.lastIndexOf("/"))) || "index");

/**
 * Follows the code from a starting line: in each step's lines, which of the
 * repo files it imports does it actually use? Those come next, at the
 * definition it uses. Depth-first, at most `max` steps, no file twice.
 */
export function buildTrace(index: RepoIndex, texts: Map<string, string | undefined>, start: TraceStart, question: string, max = 8): { steps: TraceStep[]; sequence: Sequence } {
  const files = new Map(index.files.map((f) => [f.path, f]));
  const steps: TraceStep[] = [];
  const seen = new Set<string>();
  const outside = start.kind === "route" ? "Browser" : start.kind === "entry" ? "Terminal" : "Caller";
  let usesDb: string | undefined;
  let dbStep: string | undefined;

  const visit = (path: string, line: number, how: string, from?: string) => {
    if (steps.length >= max || seen.has(path)) return;
    const f = files.get(path);
    const text = texts.get(path);
    if (!f || text === undefined) return;
    seen.add(path);
    const lines = text.split("\n");
    const [r0, r1] = region(f, lines, line);
    const body = lines.slice(r0, r1).join("\n");
    steps.push({ path, from, line, actor: actorOf(f), what: how, bubble: "" });
    // Which imported repo files does this part use, and where in it?
    const uses: { path: string; at: number; line: number; name: string }[] = [];
    for (const dep of f.imports) {
      const d = files.get(dep);
      if (!d || d.kind !== "source" || seen.has(dep)) continue;
      let best: { at: number; line: number; name: string } | undefined;
      for (const s of d.symbols) {
        const m = new RegExp(`(?<![\\w$])${s.name.replace(/[$]/g, "\\$")}\\b`).exec(body);
        if (m && (!best || m.index < best.at)) best = { at: m.index, line: s.line, name: s.name };
      }
      if (!best) {
        const m = new RegExp(`\\b${stem(dep).replace(/[^\w]/g, "")}\\b`, "i").exec(body);
        if (m) best = { at: m.index, line: d.entry?.line ?? d.main?.line ?? 0, name: stem(dep) };
      }
      if (best) uses.push({ path: dep, ...best });
    }
    // External libraries that talk to a database end the trace there.
    const lib = /(?:require\(|from\s+|import\s+)["']?([\w@/.-]+)/g;
    for (const m of text.matchAll(lib))
      if (DB_LIBS.test(m[1].toLowerCase()) && !usesDb) {
        usesDb = m[1];
        dbStep = path;
      }
    for (const u of uses.sort((a, b) => a.at - b.at).slice(0, 3)) visit(u.path, u.line, `\`${basename(path)}\` uses \`${u.name}\` from \`${u.path}\`.`, path);
  };

  visit(start.path, start.line, start.kind === "route" ? `\`${start.label}\` arrives here: line ${start.line + 1} decides what happens.` : start.kind === "entry" ? `It starts here: ${files.get(start.path)?.entry?.why ?? "the program begins"}.` : `\`${start.label}\` is defined here.`);

  // Words: who calls whom.
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const f = files.get(s.path)!;
    s.bubble = i === 0 ? (start.kind === "route" ? `${start.label} lands here.` : "It starts here.") : `Next stop: ${basename(s.path)}.`;
    if (f.role && i > 0) s.what += /^[A-Z]/.test(f.role) ? ` ${f.role.replace(/\.?$/, ".")}` : ` In short: ${f.role.replace(/\.?$/, ".")}`;
  }
  if (usesDb && dbStep) {
    const st = steps.find((x) => x.path === dbStep)!;
    st.what += ` From here the data goes to the database (through \`${usesDb}\`).`;
  }

  const actors: string[] = [outside];
  const messages: Sequence["messages"] = [];
  const actorOfPath = new Map<string, string>();
  let prev = outside;
  const byActor = new Map<string, string>(); // actor name → the file that has it
  steps.forEach((s, i) => {
    let a = s.actor;
    // Two different files with the same role get told apart by name.
    if (byActor.has(a) && byActor.get(a) !== s.path) a = `${a} (${stem(s.path)})`;
    byActor.set(a, s.path);
    s.actor = a;
    actorOfPath.set(s.path, a);
    if (!actors.includes(a)) actors.push(a);
    messages.push({ from: (s.from && actorOfPath.get(s.from)) ?? outside, to: a, label: i === 0 ? start.label : basename(s.path), stop: i });
    prev = a;
  });
  // The database is reached from the file that imports the database library.
  if (usesDb && dbStep) {
    actors.push("Database");
    messages.push({ from: actorOfPath.get(dbStep)!, to: "Database", label: "query", stop: steps.findIndex((x) => x.path === dbStep) });
  }
  return { steps, sequence: { question, actors, messages } };
}

/** A trace as a tour the panda can walk, with its sequence diagram. */
export function traceTour(question: string, steps: TraceStep[], sequence: Sequence, level: Level, ai?: Tour["ai"]): Tour {
  const stops: TourStop[] = steps.map((s, i) => ({ id: `t${i + 1}`, path: s.path, line: s.line, title: `${i + 1}. ${basename(s.path)}`, bubble: s.bubble, note: s.what }));
  return {
    kind: "trace",
    level,
    title: question ? `What happens when ${question.replace(/^(what happens )?when\s+/i, "").replace(/\?$/, "")}` : "Following the code",
    message: stops.length ? undefined : "I couldn't follow that through the code. Try one of the suggestions, or ask in different words.",
    chapters: stops.length ? [{ id: "trace", title: "Step by step", why: "In the order the code runs.", stops }] : [],
    quiz: [],
    sequence,
    ai,
  };
}
