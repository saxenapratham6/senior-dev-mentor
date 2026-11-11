// Builds the RepoIndex from the files in a workspace: what each file is,
// who imports whom, where programs start, and which files matter most.
// Pure: the caller reads the files (see walk.ts), so this is easy to test.
import { basename, classify, dirname, isCodeLanguage, languageOf } from "./files";
import { detectFrameworks, isManifest, parseManifest } from "./manifests";
import { findEntry, findRoutes, findSymbols, leadingComment, rawImports, resolveImport, ResolveContext } from "./code";
import type { CodeSymbol, FileInfo, FolderInfo, Manifest, RepoFile, RepoIndex } from "./types";

export * from "./types";

export interface IndexOptions {
  rootName: string;
  /** Commits that touched each file recently, from `git log`. Optional. */
  changes?: Map<string, number>;
  totalFiles?: number;
  truncated?: boolean;
}

export function buildIndex(files: RepoFile[], opts: IndexOptions): RepoIndex {
  files = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const paths = files.map((f) => f.path);
  const text = new Map(files.map((f) => [f.path, f.text]));

  // Manifests: shallowest first, so the root package.json describes the project.
  const manifests = files
    .filter((f) => f.text !== undefined && isManifest(f.path))
    .map((f) => parseManifest(f.path, f.text!))
    .filter((m): m is Manifest => !!m)
    .sort((a, b) => depth(a.path) - depth(b.path));
  const frameworks = detectFrameworks(manifests, paths);

  const readme = paths.filter((p) => /^readme(\.(md|rst|txt|markdown))?$/i.test(basename(p))).sort((a, b) => depth(a) - depth(b))[0];
  const primary = manifests[0];
  const description = primary?.description || (readme ? firstParagraph(text.get(readme) ?? "") : undefined);

  // Per file: what it is, its imports, symbols, entry point and routes.
  const infos: FileInfo[] = files.map((f) => {
    const language = languageOf(f.path);
    const { kind, why } = classify(f.path, f.text ?? "");
    const t = f.text ?? "";
    const code = f.text !== undefined && (kind === "source" || kind === "test");
    return {
      path: f.path,
      language,
      kind,
      size: f.size,
      lines: f.text === undefined ? 0 : t.split("\n").length,
      read: f.text !== undefined,
      imports: code ? rawImports(language, t) : [],
      importedBy: [],
      symbols: code ? findSymbols(language, t) : [],
      entry: kind === "source" ? findEntry(f.path, language, t) : undefined,
      routes: kind === "source" ? findRoutes(f.path, language, t) : [],
      doc: code ? leadingComment(language, t) : undefined,
      score: 0,
      reasons: [],
      bucket: "skip",
      skipWhy: why,
    };
  });
  const byPath = new Map(infos.map((i) => [i.path, i]));

  // Resolve imports into edges between repo files.
  const ctx: ResolveContext = {
    files: new Set(paths),
    byBase: group(paths, basename),
    dirFiles: group(paths, dirname),
    goModule: manifests.find((m) => m.kind === "go")?.name,
  };
  for (const info of infos) {
    const resolved = new Set<string>();
    for (const spec of info.imports) for (const p of resolveImport(info.path, info.language, spec, ctx)) if (p !== info.path) resolved.add(p);
    info.imports = [...resolved];
    for (const p of resolved) byPath.get(p)!.importedBy.push(info.path);
  }

  // Entry points the manifests name (package.json main/bin/scripts, pyproject scripts).
  for (const m of manifests)
    for (const e of m.entries) {
      const target = e.file.startsWith("py:") ? resolveImport(m.path, "Python", e.file.slice(3), ctx)[0] : resolveBuilt(e.file, ctx.files);
      const info = target ? byPath.get(target) : undefined;
      if (info && info.kind === "source" && !info.entry) info.entry = { line: 0, why: e.why };
    }

  // Which of a file's symbols do the files that import it actually use?
  for (const info of infos) {
    if (!info.importedBy.length) continue;
    for (const sym of info.symbols) {
      if (sym.name.length < 3) continue;
      // Not after a dot: `x.search(` is someone else's method, not this file's `search`.
      const re = new RegExp(`(?<![.\\w$])${sym.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      const by = info.importedBy.filter((p) => re.test(text.get(p) ?? ""));
      if (by.length) sym.usedBy = by;
    }
    // Most used wins; on a tie, a class over a function over a type over a constant.
    const weight = (s: CodeSymbol) => (s.usedBy?.length ?? 0) * 10 + { class: 3, function: 2, type: 1, const: 0 }[s.kind];
    info.main = info.symbols.filter((s) => s.usedBy).sort((a, b) => weight(b) - weight(a) || a.line - b.line)[0];
  }

  rank(infos, { readme: readme ? text.get(readme) ?? "" : "", changes: opts.changes, text });
  for (const i of infos) i.role = roleOf(i);

  return {
    name: primary?.name ?? opts.rootName,
    description,
    readme,
    languages: languages(infos),
    frameworks,
    manifests,
    files: infos,
    folders: folders(infos),
    totalFiles: opts.totalFiles ?? files.length,
    truncated: !!opts.truncated,
  };
}

const depth = (p: string) => p.split("/").length;

function group(paths: string[], key: (p: string) => string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of paths) {
    const k = key(p);
    out.set(k, [...(out.get(k) ?? []), p]);
  }
  return out;
}

/** A manifest may name a built file (dist/extension.js); find the source it's built from. */
function resolveBuilt(file: string, files: Set<string>): string | undefined {
  if (files.has(file)) return file;
  const stem = file.replace(/\.[cm]?js$/, "");
  const candidates = [stem, stem.replace(/(^|\/)(dist|out|build|lib)\//, "$1src/"), stem.replace(/(^|\/)(dist|out|build|lib)\//, "$1")];
  for (const c of candidates) for (const e of [".ts", ".tsx", ".js", ".mjs", ".cjs", ".mts"]) if (files.has(c + e)) return c + e;
  return undefined;
}

export function firstParagraph(md: string): string | undefined {
  for (const block of md.split(/\r?\n\s*\r?\n/)) {
    const b = block.trim();
    if (!b || /^(#|!\[|\[!\[|<|---|```|>|\||[-*] )/.test(b)) continue;
    const plain = b.replace(/\s+/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1");
    return plain.length > 300 ? plain.slice(0, 297).replace(/\s+\S*$/, "") + "…" : plain;
  }
  return undefined;
}

// ------------------------------------------------------------------ ranking

/** Folders of helper scripts: they start a program, but not *the* program. */
const TOOLING = /(^|\/)(dev|scripts?|tools?|examples?|docs?|benchmarks?|bench|hack|ci)\//i;
const HARD_SKIP = new Set(["generated", "migration", "vendored", "asset", "secret", "other"]);
const GOVERNS = /(^|\/)(settings\.py|config\.py|next\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|webpack\.config\.[cm]?js|docker-compose\.ya?ml|dockerfile|schema\.prisma|application\.(properties|ya?ml)|urls\.py)$/i;

/**
 * Scores each file from 0 to 100 and sorts it into Start here, Core,
 * Supporting or Safe to skip, keeping the reasons so the student sees why.
 */
export function rank(infos: FileInfo[], extra: { readme: string; changes?: Map<string, number>; text: Map<string, string | undefined> }): void {
  const seen = new Map<string, string>(); // text → first path, to spot copies
  for (const f of infos) {
    const reasons: string[] = [];
    let score = 0;
    if (f.entry && TOOLING.test(f.path)) {
      score += 12;
      reasons.push("a helper script you run by hand");
    } else if (f.entry) {
      score += 40;
      reasons.push("the program starts here");
    }
    const fanIn = new Set(f.importedBy).size;
    if (fanIn) {
      score += Math.min(25, Math.round(10 * Math.log2(1 + fanIn)));
      reasons.push(`imported by ${fanIn} file${fanIn === 1 ? "" : "s"}`);
    }
    const fanOut = f.imports.length;
    if (fanOut >= 3) {
      score += Math.min(10, 2 * fanOut);
      reasons.push(`brings together ${fanOut} other files`);
    }
    if (f.routes.length) {
      score += 15;
      reasons.push(`handles ${f.routes.length} web address${f.routes.length === 1 ? "" : "es"}`);
    }
    const base = basename(f.path);
    if (extra.readme && base.length >= 5 && (extra.readme.includes(f.path) || new RegExp(`\\b${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(extra.readme))) {
      score += 10;
      reasons.push("the README mentions it");
    }
    const changes = extra.changes?.get(f.path) ?? 0;
    if (changes) {
      score += Math.min(10, changes);
      reasons.push(`changed in ${changes} recent commit${changes === 1 ? "" : "s"}`);
    }
    if (f.kind === "source") score += Math.min(5, Math.floor(f.lines / 80));
    if (GOVERNS.test(f.path)) {
      score += 8;
      reasons.push("its settings change how the app behaves");
    }
    const t = extra.text.get(f.path);
    if (t && t.length > 200) {
      const first = seen.get(t);
      if (first) {
        score = 0;
        f.skipWhy = `a copy of \`${first}\``;
      } else seen.set(t, f.path);
    }
    if (f.kind === "test" || f.kind === "doc") score *= 0.3;
    if (HARD_SKIP.has(f.kind)) score *= 0.1;
    if (f.kind === "source" && f.lines <= 2 && !f.entry) score *= 0.5; // __init__.py and other near-empty files
    f.score = Math.round(Math.min(100, score));
    f.reasons = reasons;
  }

  // Start here: the strongest entry points. Core: the most important other source files.
  const sources = infos.filter((f) => f.kind === "source").sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const start = sources.filter((f) => f.entry && !TOOLING.test(f.path)).slice(0, 3);
  if (!start.length) start.push(...sources.filter((f) => f.entry).slice(0, 1));
  for (const f of start) f.bucket = "start";
  const rest = sources.filter((f) => f.bucket !== "start");
  // Score 25 and up, at most 10. A small repo may have nothing that strong, so
  // the best few files with real connections still make the core.
  let core = rest.filter((f) => f.score >= 25 && !TOOLING.test(f.path)).slice(0, 10);
  if (core.length < 4) core = [...core, ...rest.filter((f) => !core.includes(f) && f.score >= 10).slice(0, 4 - core.length)];
  for (const f of core) f.bucket = "core";
  for (const f of infos) {
    if (f.bucket !== "skip") continue;
    if (HARD_SKIP.has(f.kind) || f.skipWhy?.startsWith("a copy")) f.skipWhy ??= "not needed to understand how the code works";
    else if (f.kind === "source" && f.score < 5) f.skipWhy = f.lines <= 2 ? "only a line or two" : "nothing else in the repo uses it, so it can wait";
    else if (f.kind === "test") f.skipWhy = "a test: read it after the code it checks";
    else {
      f.bucket = "supporting";
      f.skipWhy = undefined;
    }
  }
}

// ------------------------------------------------------------------ roles and folders

const FILE_ROLES: [RegExp, string][] = [
  [/(^|\/)__init__\.py$/, "marks its folder as a Python package"],
  [/(^|\/)models?(\.\w+|\/index\.\w+)$/i, "describes the app's data, often the database tables"],
  [/(^|\/)schemas?\.\w+$/i, "describes the shape of the data"],
  [/(^|\/)views?\.py$/, "handles requests and decides what to send back"],
  [/(^|\/)urls\.py$/, "connects web addresses to the code that handles them"],
  [/(^|\/)(routes?|router)(\.\w+|\/index\.\w+)$/i, "connects web addresses to the code that handles them"],
  [/(^|\/)controllers?\//i, "handles requests for one part of the app"],
  [/(^|\/)(db|database)\.\w+$/i, "connects to the database"],
  [/(^|\/)(settings|config|configuration)\.\w+$/i, "settings for the app"],
  [/(^|\/)(utils?|helpers?|common|shared)(\.\w+|\/)/i, "small helpers used in several places"],
  [/(^|\/)hooks\/use\w+\.[jt]sx?$/, "a React hook: reusable state and logic for components"],
  [/(^|\/)components?\/.*\.(jsx|tsx|vue|svelte)$/, "a piece of the user interface"],
  [/(^|\/)(store|slices?|reducers?)\//i, "keeps the app's shared state"],
  [/(^|\/)(services?)\//i, "the app's business logic, used by the request handlers"],
  [/(^|\/)(api|client)\.[jt]s$/i, "talks to the server"],
  [/(^|\/)types?\.[jt]s$/, "type definitions shared by other files"],
  [/(^|\/)(middleware|auth)\.\w+$/i, "runs before requests reach their handler (for example, checking who you are)"],
];

function roleOf(f: FileInfo): string | undefined {
  if (f.doc) return f.doc;
  if (f.entry) return f.entry.why;
  if (f.routes.length) return "handles requests to the web addresses listed here";
  return FILE_ROLES.find(([re]) => re.test(f.path))?.[1];
}

const FOLDER_ROLES: Record<string, string> = {
  src: "the source code", lib: "the library code", app: "the app itself", apps: "the apps in this monorepo", packages: "packages shared by this monorepo",
  api: "the server's API: what the app can be asked over the network", server: "the server", backend: "the server side", client: "the part that runs in the browser or app",
  web: "the website", frontend: "what the user sees", components: "pieces of the user interface", pages: "one file per page", views: "what the user sees, or what each request returns",
  routes: "web addresses and the code that handles them", controllers: "the code that handles each kind of request", models: "the app's data, often database tables",
  services: "the business logic", utils: "small shared helpers", helpers: "small shared helpers", hooks: "React hooks: reusable state and logic",
  store: "the app's shared state", types: "shared type definitions", tests: "the tests", test: "the tests", __tests__: "the tests", spec: "the tests", e2e: "end-to-end tests that drive the real app",
  docs: "documentation", scripts: "helper scripts for developers", bin: "programs you can run", cmd: "one folder per program (Go)", internal: "code only this project may use (Go)",
  pkg: "packages other projects may use (Go)", public: "files sent to the browser as-is", static: "files sent to the browser as-is (images, CSS, scripts)", assets: "images, fonts and other media",
  templates: "HTML templates the server fills in", migrations: "database changes, recorded in order", config: "settings", styles: "the styling (CSS)", media: "images and other media",
  ".github": "GitHub settings: automated checks and deploys (workflows)", examples: "examples of how to use it", include: "C/C++ header files", res: "Android resources: layouts, strings, images",
  lessons: "lesson content", fixtures: "sample data for the tests", data: "data files", notebooks: "Jupyter notebooks", prisma: "the database schema (Prisma)", dev: "tools for developing the project",
};

function folders(infos: FileInfo[]): FolderInfo[] {
  const counts = new Map<string, FileInfo[]>();
  for (const f of infos) {
    const parts = f.path.split("/");
    if (parts.length < 2) continue;
    const keys = [parts[0]];
    // One level deeper for the folders that usually hold everything (src/, app/, packages/…).
    if (parts.length > 2 && ["src", "app", "lib", "packages", "apps"].includes(parts[0])) keys.push(`${parts[0]}/${parts[1]}`);
    for (const k of keys) counts.set(k, [...(counts.get(k) ?? []), f]);
  }
  return [...counts.entries()].map(([path, fs]) => {
    const known = FOLDER_ROLES[basename(path)] ?? FOLDER_ROLES[basename(path).toLowerCase()];
    const langs = new Map<string, number>();
    for (const f of fs) if (isCodeLanguage(f.language)) langs.set(f.language!, (langs.get(f.language!) ?? 0) + 1);
    const top = [...langs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { path, role: known ?? (top ? `${top} code` : "other files"), files: fs.length };
  });
}

function languages(infos: FileInfo[]): RepoIndex["languages"] {
  const by = new Map<string, { files: number; lines: number }>();
  for (const f of infos) {
    if ((f.kind !== "source" && f.kind !== "test") || !isCodeLanguage(f.language)) continue;
    const l = by.get(f.language!) ?? { files: 0, lines: 0 };
    l.files++;
    l.lines += f.lines;
    by.set(f.language!, l);
  }
  return [...by.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.lines - a.lines);
}
