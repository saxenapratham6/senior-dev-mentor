// Builds a guided tour of a repository, a folder or one file from the repo
// index alone: no AI. Every stop points at a real file and line, and the
// words come from what the index found, pitched at the student's level.
import type { CodeSymbol, FileInfo, Manifest, RepoIndex } from "../repo/types";
import { basename } from "../repo/files";

export type Level = "new" | "experienced";

export interface TourStop {
  id: string;
  path: string;
  line: number; // 0-based
  title: string; // shown in the outline
  bubble: string; // one sentence, for the panda's speech bubble
  note: string; // Markdown, shown when you hover the line and in the sidebar
  /** AI tours: the same idea said more simply, more deeply, and a question to check yourself. */
  simpler?: string;
  deeper?: string;
  check?: { question: string; answer: string };
}

export interface Chapter {
  id: string;
  title: string;
  why: string;
  stops: TourStop[];
}

export interface QuizQuestion {
  q: string;
  a: string;
}

export interface Tour {
  kind: "repo" | "folder" | "file";
  level: Level;
  title: string;
  /** Said by the panda when there's nothing to walk to (for example, a file it won't open). */
  message?: string;
  chapters: Chapter[];
  quiz: QuizQuestion[];
  /** Set when an AI model wrote the tour. */
  ai?: { label: string; overview: import("./ai/schema").Overview; files: number; checked: { kept: number; moved: number; dropped: number } };
}

export const LIMITS = { new: { stops: 15, core: 8 }, experienced: { stops: 10, core: 6 } };

export function flatStops(tour: Tour): TourStop[] {
  return tour.chapters.flatMap((c) => c.stops);
}

// ------------------------------------------------------------------ words

/** Terms explained the first time they come up, for students new to this. */
const TERMS = {
  framework: "A *framework* is code someone else wrote that gives an app its shape; you fill in the parts it calls.",
  entry: "An *entry point* is where a program starts running. Everything else is reached from it, so it's the best place to begin reading.",
  import: "*Importing* means one file uses code from another, so nothing has to be written twice. Following imports is how you find your way around a codebase.",
  route: "A *route* is a web address the app answers, like `/login`. GET asks for something; POST sends data, like a form.",
  dependency: "*Dependencies* are packages other people wrote that this project installs and uses.",
  script: "A *script* in `package.json` is a named shortcut for a command, run with `npm run <name>`.",
  test: "A *test* runs the real code on an example and checks the answer, so a mistake shows up right away instead of in front of users.",
  docker: "A *Dockerfile* is a recipe for packaging the app with everything it needs, so it runs the same on any computer or server.",
  ci: "A *workflow* runs automatically on GitHub, for example running the tests on every push.",
};
type Term = keyof typeof TERMS;

class Words {
  private told = new Set<Term>();
  constructor(readonly level: Level) {}
  get beginner(): boolean {
    return this.level === "new";
  }
  /** The explanation of a term, the first time only, and only for beginners. */
  term(t: Term): string {
    if (!this.beginner || this.told.has(t)) return "";
    this.told.add(t);
    return TERMS[t];
  }
}

const code = (s: string) => `\`${s.replace(/`/g, "'")}\``;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sentence = (s: string) => (/[.?!]$/.test(s) ? s : s + ".");

/** "`a`, `b` and 3 more" */
function list(items: string[], max = 3, fmt = code): string {
  const shown = items.slice(0, max).map(fmt);
  const more = items.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : (shown[0] ?? "");
}

const paragraphs = (...ps: (string | number | false | undefined)[]) => ps.filter((p): p is string => typeof p === "string" && p.trim() !== "").map((p) => p.trim()).join("\n\n");

// ------------------------------------------------------------------ the repo tour

export function buildRepoTour(index: RepoIndex, level: Level): Tour {
  const w = new Words(level);
  const files = new Map(index.files.map((f) => [f.path, f]));
  const start = index.files.filter((f) => f.bucket === "start").sort(byScore);
  const core = orderByImports(start, index.files.filter((f) => f.bucket === "core"), files).slice(0, LIMITS[level].core);
  const chapters: Chapter[] = [];
  let n = 0;
  const id = () => `s${++n}`;

  // 1. The big picture
  const overviewAt = index.readme ?? index.manifests[0]?.path ?? start[0]?.path ?? core[0]?.path;
  if (overviewAt) {
    chapters.push({
      id: "picture",
      title: "The big picture",
      why: "What this project is and how the tour goes.",
      stops: [{ id: id(), path: overviewAt, line: 0, title: index.readme ? "The README" : basename(overviewAt), bubble: `Welcome to ${index.name}! Here's what it is.`, note: overview(index, w, start.length, core.length) }],
    });
  }

  // 2. Where it starts
  if (start.length) {
    chapters.push({
      id: "start",
      title: "Where it starts",
      why: "Programs run from an entry point; everything else is reached from there.",
      stops: start.map((f, i) => ({
        id: id(),
        path: f.path,
        line: f.entry!.line,
        title: basename(f.path),
        bubble: i === 0 ? "The program starts here." : `Another way in: ${short(f.entry!.why)}`,
        note: entryNote(f, w),
      })),
    });
  }

  // 3. The files that do the work
  if (core.length) {
    chapters.push({
      id: "core",
      title: "The files that do the work",
      why: "The files the rest of the code depends on most.",
      stops: core.map((f, i) => ({ id: id(), path: f.path, line: focusLine(f), title: basename(f.path), bubble: coreBubble(f), note: fileNote(f, w, i % 2 === 1) })),
    });
  }

  // 4. How it's set up
  const setup = setupStops(index, w, id);
  if (setup.length) chapters.push({ id: "setup", title: "How it's set up and run", why: "Where the dependencies, commands and deploy settings live.", stops: setup });

  // 5. How it's tested
  const test = testStop(index, w, id, new Set([...start, ...core].map((f) => f.path)));
  if (test) chapters.push({ id: "tests", title: "How it's tested", why: "Tests show how the code is meant to be used.", stops: [test] });

  trim(chapters, LIMITS[level].stops);
  return { kind: "repo", level, title: `Tour of ${index.name}`, chapters, quiz: quiz(index, start, core) };
}

function overview(index: RepoIndex, w: Words, starts: number, cores: number): string {
  const langs = index.languages.slice(0, 3).map((l) => l.name);
  const fws = index.frameworks.filter((f) => !["jest", "vitest", "mocha", "pytest"].includes(f.id)).slice(0, 4);
  const what = index.description ? sentence(index.description) : "The README doesn't say what it is in one line, so the code will have to tell us.";
  if (!w.beginner)
    return paragraphs(
      `**${index.name}**: ${what}`,
      [langs.length && list(langs, 3, (s) => s), fws.length && `uses ${list(fws.map((f) => f.name), 4, (s) => s)}`].filter(Boolean).join("; ") + ".",
      `Tour: ${starts ? "entry point → " : ""}${cores} core files → setup → tests.`,
    );
  return paragraphs(
    `**${index.name}**: ${what}`,
    langs.length && `It's written mostly in ${list(langs, 3, (s) => s)}.`,
    fws.length && `It uses ${fws.map((f) => `**${f.name}** (${f.what})`).join(", ")}. ${w.term("framework")}`,
    `Here's the plan: first where the program starts, then the ${cores} files that do most of the work, then how it's set up and tested. The board shows the whole map and marks where we are. Press **Next** when you're ready.`,
  );
}

function entryNote(f: FileInfo, w: Words): string {
  return paragraphs(
    `${code(f.path)}: ${sentence(f.entry!.why)}`,
    f.doc && `The comment at the top says: *${f.doc}*`,
    w.term("entry"),
    f.imports.length > 0 && `From here it uses ${list(f.imports)}. ${w.term("import")}`,
    f.routes.length > 0 && routeLine(f, w),
    w.beginner && "**Try this:** before going on, guess what happens first when this program runs.",
  );
}

function coreBubble(f: FileInfo): string {
  if (f.routes.length) return `This file answers ${f.routes.length === 1 ? "a web address" : `${f.routes.length} web addresses`}.`;
  if (f.main?.usedBy?.length) return `${f.main.name} lives here; ${f.main.usedBy.length} file${f.main.usedBy.length === 1 ? " uses" : "s use"} it.`;
  if (f.role) return cap(sentence(short(f.role)));
  return `${f.importedBy.length} file${f.importedBy.length === 1 ? "" : "s"} depend on this one.`;
}

/** What a file is for, who uses it and what to look at. */
function fileNote(f: FileInfo, w: Words, askQuestion: boolean): string {
  if (!w.beginner) {
    const bits = [
      f.role && short(f.role),
      f.importedBy.length && `used by ${list(f.importedBy, 3)}`,
      f.imports.length && `uses ${list(f.imports, 3)}`,
      f.routes.length && `routes: ${f.routes.slice(0, 4).map((r) => code(`${r.method} ${r.path}`)).join(", ")}`,
      f.main && `key: ${code(f.main.name)} (line ${f.main.line + 1}${f.main.usedBy ? `, used by ${f.main.usedBy.length}` : ""})`,
    ].filter(Boolean);
    return `${code(f.path)} · ${bits.join(" · ")}`;
  }
  const main = f.main;
  return paragraphs(
    `${code(f.path)}${f.role ? `: ${sentence(f.role)}` : "."}`,
    f.importedBy.length > 0 && `It's used by ${list(f.importedBy)}. ${w.term("import")}`,
    f.imports.length > 0 && `It uses ${list(f.imports)}.`,
    f.routes.length > 0 && routeLine(f, w),
    main
      ? `Look at ${code(main.name)} on line ${main.line + 1}: ${main.usedBy!.length} other file${main.usedBy!.length === 1 ? " uses" : "s use"} it (${list(main.usedBy!, 2)}), so it's the part the rest of the code relies on.`
      : f.symbols.length > 0 && `It defines ${list(f.symbols.map((s) => s.name), 4)}.`,
    askQuestion && main && `**Try this:** from its name and where it's used, what do you think ${code(main.name)} does? Read it and check.`,
  );
}

function routeLine(f: FileInfo, w: Words): string {
  return `It answers ${f.routes.length === 1 ? "this web address" : "these web addresses"}: ${f.routes.slice(0, 5).map((r) => code(`${r.method} ${r.path}`)).join(", ")}${f.routes.length > 5 ? ` and ${f.routes.length - 5} more` : ""}. ${w.term("route")}`;
}

/** The line most worth looking at: a route, the most-used symbol, or the first definition. */
function focusLine(f: FileInfo): number {
  return f.routes[0]?.line ?? f.main?.line ?? f.symbols[0]?.line ?? 0;
}

function setupStops(index: RepoIndex, w: Words, id: () => string): TourStop[] {
  const stops: TourStop[] = [];
  const m = index.manifests.find((x) => x.kind !== "python" || !/requirements/.test(x.path)) ?? index.manifests[0];
  if (m) stops.push({ id: id(), path: m.path, line: m.scriptsLine ?? 0, title: basename(m.path), bubble: "How to install and run it.", note: manifestNote(m, index, w) });
  const docker = index.files.find((f) => /^dockerfile$/i.test(basename(f.path)) && f.read);
  if (docker)
    stops.push({ id: id(), path: docker.path, line: 0, title: "Dockerfile", bubble: "How it's packaged to run anywhere.", note: paragraphs(`${code(docker.path)} packages the app into a container.`, w.term("docker") || "Read it top to bottom: base image, install, copy, then the start command.") });
  const workflow = index.files.find((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f.path) && f.read);
  if (workflow)
    stops.push({ id: id(), path: workflow.path, line: 0, title: basename(workflow.path), bubble: "What runs automatically on GitHub.", note: paragraphs(`${code(workflow.path)} runs on GitHub by itself.`, w.term("ci") || "Check the `on:` trigger and the steps.") });
  return stops.slice(0, 3);
}

function manifestNote(m: Manifest, index: RepoIndex, w: Words): string {
  const run = runCommands(m);
  const deps = m.deps.filter((d) => !d.startsWith("@types/")).slice(0, 6);
  if (!w.beginner) return `${code(m.path)} · ${run.length ? `run: ${run.map(([c]) => code(c)).join(", ")}` : "no run scripts"} · ${m.deps.length} deps`;
  return paragraphs(
    `${code(m.path)} lists what the project needs and how to run it.`,
    install(m) && `Install what it needs with ${code(install(m)!)}. ${w.term("dependency")}`,
    deps.length > 0 && `It depends on ${list(deps, 6)}.`,
    run.length > 0 && `To run it: ${run.map(([c, what]) => `${code(c)}${what ? ` (runs ${code(what)})` : ""}`).join(", ")}. ${m.kind === "npm" ? w.term("script") : ""}`,
  );
}

function install(m: Manifest): string | undefined {
  return { npm: "npm install", python: /requirements/.test(m.path) ? `pip install -r ${basename(m.path)}` : "pip install -e .", go: "go mod download", cargo: "cargo build", maven: "mvn install", gradle: "./gradlew build", ruby: "bundle install", php: "composer install" }[m.kind];
}

function runCommands(m: Manifest): [string, string][] {
  if (m.kind === "npm") return ["dev", "start", "build", "test"].filter((s) => m.scripts[s]).map((s) => [s === "start" || s === "test" ? `npm ${s}` : `npm run ${s}`, m.scripts[s]]);
  if (m.kind === "python") return Object.keys(m.scripts).slice(0, 3).map((s) => [s, ""]);
  if (m.kind === "go") return [["go run .", ""]];
  if (m.kind === "cargo") return [["cargo run", ""]];
  return [];
}

function testCommand(index: RepoIndex): string | undefined {
  const npm = index.manifests.find((m) => m.kind === "npm" && m.scripts.test);
  if (npm) return "npm test";
  if (index.frameworks.some((f) => f.id === "pytest") || index.files.some((f) => f.kind === "test" && f.language === "Python")) return "pytest";
  const kinds = new Set(index.manifests.map((m) => m.kind));
  if (kinds.has("go")) return "go test ./...";
  if (kinds.has("cargo")) return "cargo test";
  if (kinds.has("maven")) return "mvn test";
  if (kinds.has("gradle")) return "./gradlew test";
  return undefined;
}

function testStop(index: RepoIndex, w: Words, id: () => string, important: Set<string>): TourStop | undefined {
  const tests = index.files.filter((f) => f.kind === "test" && f.read && f.lines > 2);
  const t = tests.find((f) => f.imports.some((p) => important.has(p))) ?? tests.sort(byScore)[0];
  if (!t) return undefined;
  const checks = t.imports.filter((p) => important.has(p));
  const cmd = testCommand(index);
  return {
    id: id(),
    path: t.path,
    line: t.symbols[0]?.line ?? 0,
    title: basename(t.path),
    bubble: checks.length ? `This tests ${basename(checks[0])}.` : "The tests live here.",
    note: w.beginner
      ? paragraphs(
          `${code(t.path)} is one of ${tests.length} test file${tests.length === 1 ? "" : "s"}${checks.length ? `; it checks ${list(checks)}` : ""}.`,
          w.term("test"),
          cmd && `Run them with ${code(cmd)}.`,
          "Tests are a good way to learn a codebase: each one shows how a piece is meant to be used and what it should return.",
        )
      : `${code(t.path)} · ${tests.length} test files${checks.length ? ` · checks ${list(checks, 2)}` : ""}${cmd ? ` · run ${code(cmd)}` : ""}`,
  };
}

function quiz(index: RepoIndex, start: FileInfo[], core: FileInfo[]): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  if (start[0]) out.push({ q: "Where does the program start?", a: `${code(start[0].path)}: ${sentence(start[0].entry!.why)}` });
  const routed = [...start, ...core].find((f) => f.routes.length);
  if (routed) {
    const r = routed.routes.find((x) => x.method === "POST") ?? routed.routes[0];
    out.push({ q: `Which file answers ${code(`${r.method} ${r.path}`)}?`, a: `${code(routed.path)}, line ${r.line + 1}.` });
  }
  const used = core.filter((f) => f.main?.usedBy?.length).sort((a, b) => b.main!.usedBy!.length - a.main!.usedBy!.length)[0];
  if (used) out.push({ q: `Where is ${code(used.main!.name)} defined, and who uses it?`, a: `${code(used.path)}, line ${used.main!.line + 1}. It's used by ${list(used.main!.usedBy!)}.` });
  const cmd = testCommand(index);
  if (cmd) out.push({ q: "How do you run the tests?", a: `${code(cmd)}.` });
  return out;
}

// ------------------------------------------------------------------ one file, one folder

export function buildFileTour(index: RepoIndex, path: string, level: Level): Tour {
  const w = new Words(level);
  const f = index.files.find((x) => x.path === path);
  const title = `Explaining ${basename(path)}`;
  if (!f) return { kind: "file", level, title, message: "I don't know that file: it may be ignored (like build output) or new since I looked. Try the tour again.", chapters: [], quiz: [] };
  if (!f.read)
    return {
      kind: "file",
      level,
      title,
      message: f.kind === "secret" ? `I won't open ${basename(path)}: it ${f.skipWhy}.` : `I didn't read ${basename(path)}: ${f.skipWhy ?? "it's too big or not text"}.`,
      chapters: [],
      quiz: [],
    };
  let n = 0;
  const id = () => `f${++n}`;
  const stops: TourStop[] = [{ id: id(), path, line: f.entry?.line ?? 0, title: "What it's for", bubble: f.entry ? "The program starts here." : f.role ? cap(sentence(short(f.role))) : `Here's ${basename(path)}.`, note: f.entry ? entryNote(f, w) : fileOverview(f, w) }];
  const seen = new Set<number>([stops[0].line]);
  for (const r of f.routes.slice(0, 3))
    if (!seen.has(r.line)) {
      seen.add(r.line);
      stops.push({ id: id(), path, line: r.line, title: `${r.method} ${r.path}`, bubble: `This answers ${r.method} ${r.path}.`, note: paragraphs(`Line ${r.line + 1} answers ${code(`${r.method} ${r.path}`)}.`, w.term("route"), w.beginner && "Read the function below it: what does it send back?") });
    }
  const symbols = [...f.symbols].sort((a, b) => (b.usedBy?.length ?? 0) - (a.usedBy?.length ?? 0) || a.line - b.line);
  for (const s of symbols) {
    if (stops.length >= (level === "new" ? 6 : 5)) break;
    if (seen.has(s.line)) continue;
    seen.add(s.line);
    stops.push({ id: id(), path, line: s.line, title: s.name, bubble: symbolBubble(s), note: symbolNote(s, w) });
  }
  stops.sort((a, b) => a.line - b.line);
  return { kind: "file", level, title, chapters: [{ id: "file", title: path, why: f.role ?? "", stops }], quiz: [] };
}

function fileOverview(f: FileInfo, w: Words): string {
  return paragraphs(
    `${code(f.path)}${f.role ? `: ${sentence(f.role)}` : "."}`,
    f.importedBy.length ? `It's used by ${list(f.importedBy)}. ${w.term("import")}` : "No other file in the repo imports it.",
    f.imports.length > 0 && `It uses ${list(f.imports)}.`,
    f.symbols.length > 0 && `It defines ${list(f.symbols.map((s) => s.name), 5)}. I'll walk through the main ones.`,
  );
}

function symbolBubble(s: CodeSymbol): string {
  const what = s.kind === "class" ? "class" : s.kind === "type" ? "type" : s.kind === "const" ? "value" : "function";
  return s.usedBy?.length ? `The ${what} ${s.name}: ${s.usedBy.length} other file${s.usedBy.length === 1 ? " uses" : "s use"} it.` : `The ${what} ${s.name}.`;
}

function symbolNote(s: CodeSymbol, w: Words): string {
  const kind = { function: "a function", class: "a class", type: "a type", const: "a value" }[s.kind];
  return paragraphs(
    `${code(s.name)} is ${kind}, on line ${s.line + 1}.`,
    s.usedBy?.length ? `It's used by ${list(s.usedBy)}.` : "Nothing outside this file uses it, so it's a helper for the code here.",
    w.beginner && (s.kind === "function" ? "**Try this:** read its inputs and what it returns, then say what it does in one sentence." : "**Try this:** what data does it hold, and who creates one?"),
  );
}

export function buildFolderTour(index: RepoIndex, folder: string, level: Level): Tour {
  const w = new Words(level);
  const inside = index.files.filter((f) => f.path.startsWith(folder + "/") && f.bucket !== "skip" && f.read).sort(byScore);
  const role = index.folders.find((f) => f.path === folder)?.role;
  const title = `Explaining ${folder}/`;
  if (!inside.length) return { kind: "folder", level, title, message: `Nothing in ${folder}/ needs reading to understand the code${role ? ` (it holds ${role})` : ""}.`, chapters: [], quiz: [] };
  const all = index.files.filter((f) => f.path.startsWith(folder + "/")).length;
  const stops = inside.slice(0, level === "new" ? 6 : 5).map((f, i) => ({
    id: `d${i + 1}`,
    path: f.path,
    line: f.entry?.line ?? focusLine(f),
    title: f.path.slice(folder.length + 1),
    bubble: i === 0 ? `${folder}/ holds ${role ?? "this part of the code"}.` : coreBubble(f),
    note: paragraphs(i === 0 && `${code(folder + "/")}${role ? ` holds ${role}` : ""}. It has ${all} file${all === 1 ? "" : "s"}; these are the ones worth reading, most important first.`, f.entry ? entryNote(f, w) : fileNote(f, w, i === 1)),
  }));
  return { kind: "folder", level, title, chapters: [{ id: "folder", title: `${folder}/`, why: role ?? "", stops }], quiz: [] };
}

// ------------------------------------------------------------------ helpers

const byScore = (a: FileInfo, b: FileInfo) => b.score - a.score || a.path.localeCompare(b.path);
const short = (s: string) => s.replace(/`/g, "").replace(/[.;:].*$/, "");

/** Core files in the order you'd meet them following imports from the entry points. */
function orderByImports(start: FileInfo[], core: FileInfo[], files: Map<string, FileInfo>): FileInfo[] {
  const want = new Set(core.map((f) => f.path));
  const out: FileInfo[] = [];
  const queue = start.map((f) => f.path);
  const seen = new Set(queue);
  while (queue.length) {
    const p = queue.shift()!;
    const f = files.get(p);
    if (!f) continue;
    if (want.has(p)) out.push(f);
    for (const next of [...f.imports].sort((a, b) => (files.get(b)?.score ?? 0) - (files.get(a)?.score ?? 0)))
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  }
  for (const f of [...core].sort(byScore)) if (!out.includes(f)) out.push(f);
  return out;
}

/** Keep the tour short: trim the core chapter first, then setup. */
function trim(chapters: Chapter[], max: number): void {
  const count = () => chapters.reduce((n, c) => n + c.stops.length, 0);
  for (const id of ["core", "setup", "start"]) {
    const c = chapters.find((x) => x.id === id);
    while (c && count() > max && c.stops.length > 1) c.stops.pop();
  }
}

