// Reading code without running it: imports, top-level symbols, where a
// program starts, and which web addresses it handles. Regular expressions,
// not parsers, so they're fast and work for any project; each one is tested.
import { basename, dirname } from "./files";
import type { CodeSymbol, EntryPoint, Route } from "./types";

const lineAt = (text: string, index: number) => text.slice(0, index).split("\n").length - 1;
const all = (text: string, re: RegExp) => [...text.matchAll(re)];

// ------------------------------------------------------------------ imports

/** Import specifiers as written in the file, e.g. "./db", "flask", "wordcount.counter". */
export function rawImports(language: string | undefined, text: string): string[] {
  const out: string[] = [];
  const push = (s: string | undefined) => s && out.push(s);
  switch (language) {
    case "JavaScript":
    case "TypeScript":
    case "Vue":
    case "Svelte":
      for (const m of all(text, /\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"'\n]+)["']/g)) push(m[1]);
      for (const m of all(text, /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+["']([^"'\n]+)["']/g)) push(m[1]);
      for (const m of all(text, /\b(?:require|import)\(\s*["']([^"'\n]+)["']\s*\)/g)) push(m[1]);
      break;
    case "Python":
      for (const m of all(text, /^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n#]+)/gm)) {
        const mod = m[1];
        const names = m[2].replace(/[()\\]/g, " ").split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim()).filter((n) => /^\w+$/.test(n));
        // `from pkg import mod` may import a submodule; try that first, then the package.
        for (const n of names) push(mod.endsWith(".") ? mod + n : `${mod}.${n}`);
        if (mod.replace(/\./g, "")) push(mod);
      }
      for (const m of all(text, /^[ \t]*import[ \t]+([\w.]+(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[\w.]+(?:[ \t]+as[ \t]+\w+)?)*)/gm))
        for (const part of m[1].split(",")) push(part.trim().split(/\s+as\s+/)[0]);
      break;
    case "Go":
      for (const m of all(text, /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm)) push(m[1]);
      for (const block of all(text, /^\s*import\s*\(([\s\S]*?)\)/gm)) for (const m of all(block[1], /"([^"]+)"/g)) push(m[1]);
      break;
    case "Java":
    case "Kotlin":
      for (const m of all(text, /^\s*import\s+(?:static\s+)?([\w.]+?)(?:\.\*)?\s*;?\s*$/gm)) push(m[1]);
      break;
    case "Rust":
      for (const m of all(text, /^\s*(?:pub(?:\([\w ]+\))?\s+)?mod\s+(\w+)\s*;/gm)) push(`mod:${m[1]}`);
      break;
    case "C":
    case "C++":
      for (const m of all(text, /^\s*#\s*include\s+"([^"]+)"/gm)) push(m[1]);
      break;
    case "HTML":
      for (const m of all(text, /<script\b[^>]*\bsrc=["']([^"']+)["']/g)) if (!/^(https?:)?\/\//.test(m[1])) push(m[1]);
      break;
  }
  return [...new Set(out)];
}

export interface ResolveContext {
  files: Set<string>;
  byBase: Map<string, string[]>; // file name → paths
  dirFiles: Map<string, string[]>; // folder → its files
  goModule?: string;
}

const JS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".json"];

function normalize(path: string): string | undefined {
  const parts: string[] = [];
  for (const p of path.split("/")) {
    if (p === "" || p === ".") continue;
    if (p === "..") {
      if (!parts.length) return undefined;
      parts.pop();
    } else parts.push(p);
  }
  return parts.join("/");
}

const join = (dir: string, rel: string) => normalize(dir ? `${dir}/${rel}` : rel);

/** Repo files an import specifier points at. External packages resolve to nothing. */
export function resolveImport(from: string, language: string | undefined, spec: string, ctx: ResolveContext): string[] {
  const dir = dirname(from);
  const has = (p: string | undefined) => (p !== undefined && ctx.files.has(p) ? p : undefined);
  switch (language) {
    case "JavaScript":
    case "TypeScript":
    case "Vue":
    case "Svelte":
    case "HTML": {
      let base: string | undefined;
      if (spec.startsWith(".")) base = join(dir, spec);
      else if (spec.startsWith("/")) base = normalize(spec); // <script src="/src/main.tsx"> in index.html
      else if (/^[@~]\//.test(spec)) base = ["src/" + spec.slice(2), spec.slice(2)].find((p) => [...JS_EXTS, ""].some((e) => ctx.files.has(p + e) || ctx.files.has(`${p}/index${e}`)));
      if (base === undefined) return [];
      const stem = base.replace(/\.[cm]?js$/, "");
      for (const c of [base, ...JS_EXTS.map((e) => base + e), ...JS_EXTS.map((e) => stem + e), ...JS_EXTS.map((e) => `${base}/index${e}`)]) if (has(c)) return [c];
      return [];
    }
    case "Python": {
      const dots = spec.match(/^\.*/)![0].length;
      const parts = spec.slice(dots).split(".").filter(Boolean);
      let roots: string[];
      if (dots) {
        let base: string | undefined = dir;
        for (let i = 1; i < dots && base !== undefined; i++) base = base ? dirname(base) : undefined;
        if (base === undefined) return [];
        roots = [base];
      } else {
        // Absolute imports resolve from the repo root, a src/ folder, or the script's own folder.
        roots = ["", "src", dir];
      }
      for (const root of roots) {
        const p = [root, ...parts].filter(Boolean).join("/");
        const hit = has(`${p}.py`) ?? (p ? has(`${p}/__init__.py`) : undefined);
        if (hit) return [hit];
      }
      return [];
    }
    case "Go": {
      if (!ctx.goModule || !spec.startsWith(ctx.goModule + "/")) return [];
      const d = spec.slice(ctx.goModule.length + 1);
      return (ctx.dirFiles.get(d) ?? []).filter((f) => f.endsWith(".go") && !f.endsWith("_test.go")).slice(0, 6);
    }
    case "Java":
    case "Kotlin": {
      const parts = spec.split(".");
      for (const n of [parts.length, parts.length - 1]) {
        const suffix = parts.slice(0, n).join("/");
        const cls = parts[n - 1];
        for (const e of [".java", ".kt"]) {
          const hit = (ctx.byBase.get(cls + e) ?? []).find((p) => p.endsWith(suffix + e));
          if (hit) return [hit];
        }
      }
      return [];
    }
    case "Rust": {
      if (!spec.startsWith("mod:")) return [];
      const name = spec.slice(4);
      const stem = basename(from).replace(/\.rs$/, "");
      const base = ["main", "lib", "mod"].includes(stem) ? dir : join(dir, stem);
      return [join(base ?? "", `${name}.rs`), join(base ?? "", `${name}/mod.rs`)].filter((p): p is string => !!has(p)).slice(0, 1);
    }
    case "C":
    case "C++": {
      const direct = has(join(dir, spec));
      if (direct) return [direct];
      return (ctx.byBase.get(basename(spec)) ?? []).filter((p) => p.endsWith(spec)).slice(0, 1);
    }
  }
  return [];
}

// ------------------------------------------------------------------ symbols

const SYMBOL_PATTERNS: Record<string, [RegExp, CodeSymbol["kind"]][]> = {
  Python: [
    [/^(?:async\s+)?def\s+(\w+)/gm, "function"],
    [/^class\s+(\w+)/gm, "class"],
  ],
  JavaScript: [
    [/^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*(\w+)/gm, "function"],
    [/^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)/gm, "class"],
    [/^(?:export\s+)?const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>/gm, "function"],
    [/^(?:export\s+)?(?:interface|type|enum)\s+(\w+)/gm, "type"],
    [/^export\s+(?:const|let)\s+(\w+)/gm, "const"],
  ],
  Go: [
    [/^func\s+(?:\([^)]*\)\s*)?(\w+)/gm, "function"],
    [/^type\s+(\w+)/gm, "type"],
  ],
  Java: [[/^(?:public\s+|final\s+|abstract\s+)*(?:class|interface|enum|record)\s+(\w+)/gm, "class"]],
  Kotlin: [
    [/^(?:\w+\s+)*(?:class|interface|object)\s+(\w+)/gm, "class"],
    [/^(?:\w+\s+)*fun\s+(\w+)/gm, "function"],
  ],
  Rust: [
    [/^(?:pub(?:\([\w ]+\))?\s+)?(?:async\s+)?fn\s+(\w+)/gm, "function"],
    [/^(?:pub(?:\([\w ]+\))?\s+)?(?:struct|enum|trait)\s+(\w+)/gm, "type"],
  ],
  C: [[/^[\w*\s]+?\b(\w+)\s*\([^;{]*\)\s*\{/gm, "function"]],
  Ruby: [
    [/^\s{0,2}def\s+(?:self\.)?(\w+[?!]?)/gm, "function"],
    [/^\s{0,2}(?:class|module)\s+(\w+)/gm, "class"],
  ],
};
SYMBOL_PATTERNS.TypeScript = SYMBOL_PATTERNS.JavaScript;
SYMBOL_PATTERNS["C++"] = SYMBOL_PATTERNS.C;

const NOT_SYMBOLS = new Set(["if", "for", "while", "switch", "return", "main", "else"]);

/** Top-level functions, classes and types, in file order. */
export function findSymbols(language: string | undefined, text: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  for (const [re, kind] of SYMBOL_PATTERNS[language ?? ""] ?? [])
    for (const m of all(text, re)) if (!NOT_SYMBOLS.has(m[1]) && !out.some((s) => s.name === m[1])) out.push({ name: m[1], line: lineAt(text, m.index!), kind });
  return out.sort((a, b) => a.line - b.line).slice(0, 60);
}

// ------------------------------------------------------------------ where programs start

/** Signs in the code itself that a file is where a program starts. */
export function findEntry(path: string, language: string | undefined, text: string): EntryPoint | undefined {
  const base = basename(path);
  const first = (re: RegExp, why: string): EntryPoint | undefined => {
    const m = re.exec(text);
    return m ? { line: lineAt(text, m.index + (m[0].length - m[0].trimStart().length)), why } : undefined;
  };
  switch (language) {
    case "Python":
      if (base === "manage.py") return { line: 0, why: "Django's command-line tool: `python manage.py runserver` starts the site" };
      return (
        first(/^\s*(\w+)\s*=\s*(?:flask\.)?Flask\(/m, "creates the Flask app; every web address is attached to it") ??
        first(/^\s*(\w+)\s*=\s*(?:fastapi\.)?FastAPI\(/m, "creates the FastAPI app; every web address is attached to it") ??
        first(/^\s*application\s*=\s*get_[wa]sgi_application\(/m, "where a web server loads the Django project") ??
        first(/^if\s+__name__\s*==\s*["']__main__["']\s*:/m, `runs when you start it with \`python ${base}\``) ??
        (/^\s*import\s+streamlit|^\s*from\s+streamlit/m.test(text) && /^(app|main|streamlit_app|home)\.py$/i.test(base) ? { line: 0, why: `a Streamlit page: \`streamlit run ${base}\` opens it` } : undefined)
      );
    case "JavaScript":
    case "TypeScript":
      return (
        first(/^export\s+(?:async\s+)?function\s+activate\s*\(/m, "VS Code calls `activate` when the extension starts") ??
        first(/\bcreateRoot\s*\(|\bReactDOM\.render\s*\(|\bhydrateRoot\s*\(/, "draws the app into the web page; every component is reached from here") ??
        first(/\bcreateApp\s*\([\s\S]{0,200}?\.mount\s*\(/, "creates the app and puts it on the page") ??
        first(/\bplatformBrowserDynamic\(\)|\bbootstrapApplication\s*\(/, "starts the Angular app") ??
        first(/\bNestFactory\.create\s*\(/, "starts the NestJS server") ??
        first(/\bapp\.whenReady\s*\(|\bnew\s+BrowserWindow\s*\(/, "starts the desktop app and opens its window") ??
        first(/^\s*(?:\w+\.)?(?:listen)\s*\(\s*(?:process\.env\.PORT|PORT|port|\d{2,5})\b|\.listen\(\s*(?:process\.env\.PORT|PORT|port|\d{2,5})\b/m, "starts the web server and waits for requests") ??
        (/^#!.*\bnode\b/.test(text) ? { line: 0, why: "a command-line program (the first line says to run it with Node)" } : undefined) ??
        (/(^|\/)app\/layout\.[jt]sx$/.test(path) ? { line: 0, why: "the layout that wraps every page of the Next.js app" } : undefined) ??
        (/(^|\/)pages\/_app\.[jt]sx?$/.test(path) ? { line: 0, why: "wraps every page of the Next.js app" } : undefined)
      );
    case "Go":
      return /^package\s+main\b/m.test(text) ? first(/^func\s+main\s*\(\s*\)/m, "`func main()`: the program starts here") : undefined;
    case "Java":
    case "Kotlin":
      return first(/^\s*@SpringBootApplication/m, "starts the Spring Boot app") ?? first(/\bpublic\s+static\s+void\s+main\s*\(|^fun\s+main\s*\(/m, "the program starts at `main`");
    case "Rust":
      return /(^|\/)src\/(main\.rs|bin\/\w+\.rs)$/.test(path) ? first(/^\s*(?:async\s+)?fn\s+main\s*\(/m, "`fn main()`: the program starts here") : undefined;
    case "C":
    case "C++":
      return first(/^\s*int\s+main\s*\(/m, "`main`: the program starts here");
    case "C#":
      return first(/\bstatic\s+(?:async\s+)?\S+\s+Main\s*\(/, "the program starts at `Main`") ?? (base === "Program.cs" ? { line: 0, why: "the program starts here" } : undefined);
    case "HTML":
      return /^(?:(?:public|src|static|web|client|frontend)\/)?index\.html$/.test(path) ? { line: 0, why: "the page the browser loads first" } : undefined;
  }
  return undefined;
}

// ------------------------------------------------------------------ web addresses

/** HTTP routes a file defines, for the common web frameworks. */
export function findRoutes(path: string, language: string | undefined, text: string): Route[] {
  const out: Route[] = [];
  const add = (index: number, method: string, p: string) => out.length < 40 && out.push({ line: lineAt(text, index), method: method.toUpperCase(), path: p });
  switch (language) {
    case "JavaScript":
    case "TypeScript": {
      for (const m of all(text, /\b(?:app|router|server|api|routes?|\w+Router)\.(get|post|put|patch|delete|all|use)\(\s*["'`](\/[^"'`]*)["'`]/g))
        add(m.index!, m[1] === "use" ? "USE" : m[1], m[2]);
      // Next.js: the file's location is its address.
      const app = path.match(/(?:^|\/)app\/(.*?)\/?(route|page)\.[jt]sx?$/);
      if (app) {
        const url = "/" + app[1].split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/");
        if (app[2] === "route") for (const m of all(text, /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) add(m.index!, m[1], url);
        else add(0, "PAGE", url);
      }
      const pages = path.match(/(?:^|\/)pages\/(api\/)?(.*?)\.[jt]sx?$/);
      if (pages && !/^_/.test(basename(path))) add(0, pages[1] ? "API" : "PAGE", "/" + (pages[1] ? "api/" : "") + pages[2].replace(/(^|\/)index$/, ""));
      break;
    }
    case "Python":
      for (const m of all(text, /@\w+\.route\(\s*["']([^"']+)["']([^)]*)\)/g)) {
        const methods = m[2].match(/methods\s*=\s*\[([^\]]*)\]/)?.[1].match(/\w+/g) ?? ["GET"];
        for (const meth of methods) add(m.index!, meth, m[1]);
      }
      for (const m of all(text, /@\w+\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g)) add(m.index!, m[1], m[2]);
      if (basename(path) === "urls.py") for (const m of all(text, /\b(?:re_)?path\(\s*r?["']([^"']*)["']/g)) add(m.index!, "URL", "/" + m[1]);
      break;
    case "Go":
      for (const m of all(text, /\b(?:http\.)?HandleFunc\(\s*"([^"]+)"/g)) add(m.index!, "ANY", m[1]);
      for (const m of all(text, /\.(GET|POST|PUT|PATCH|DELETE)\(\s*"([^"]+)"/g)) add(m.index!, m[1], m[2]);
      break;
    case "Java":
    case "Kotlin":
      for (const m of all(text, /@(Get|Post|Put|Patch|Delete|Request)Mapping\(\s*(?:value\s*=\s*|path\s*=\s*)?\{?\s*"([^"]*)"/g)) add(m.index!, m[1] === "Request" ? "ANY" : m[1], m[2]);
      break;
    case "Ruby":
      if (basename(path) === "routes.rb") for (const m of all(text, /^\s*(get|post|put|patch|delete|resources?)\s+["':]([\w/:]+)/gm)) add(m.index!, m[1], m[2]);
      break;
  }
  return out;
}

// ------------------------------------------------------------------ what the file says about itself

/**
 * The comment or docstring at the top of a file, as one or two sentences:
 * often the author's own summary of what the file is for. License headers
 * and tool directives are skipped.
 */
export function leadingComment(language: string | undefined, text: string): string | undefined {
  const lines = text.split(/\r?\n/).slice(0, 60);
  let i = 0;
  // Blank lines, directives and imports may come before the comment.
  const skip = (l: string) =>
    !l.trim() ||
    /^#!|^\s*#\s*-\*-|^\s*["']use (strict|client|server)["']|^\s*\/\/\s*(@ts-|eslint|prettier|#region)|^\s*package\s|^\s*<\?php/.test(l) ||
    /^\s*(import\b|from\s+\S+\s+import\b|export\s+\*\s+from|(const|let|var)\s+[\w{}\s,]+=\s*require\(|[\w\s,]*\}\s*from\s+["']|\w+(\s+as\s+\w+)?,\s*$|using\s+[\w.]+;)/.test(l);
  const blocks: string[] = [];
  while (i < lines.length && blocks.length < 3) {
    while (i < lines.length && skip(lines[i])) i++;
    const l = lines[i] ?? "";
    let block: string[] = [];
    if (/^\s*(\/\/|#(?!include|define|pragma|import|if))/.test(l)) {
      while (i < lines.length && /^\s*(\/\/+|#)/.test(lines[i]) && !/^\s*#(include|define|pragma|import|if)/.test(lines[i])) block.push(lines[i++].replace(/^\s*(\/\/+!?|#+)\s?/, ""));
    } else if (/^\s*\/\*/.test(l)) {
      while (i < lines.length) {
        const cur = lines[i++];
        block.push(cur.replace(/^\s*\/\*+!?\s?|\s*\*+\/\s*$|^\s*\*\s?/g, ""));
        if (/\*\//.test(cur)) break;
      }
    } else if (language === "Python" && /^\s*[rRuU]?("""|\'\'\')/.test(l)) {
      const q = l.includes('"""') ? '"""' : "\'\'\'";
      const first = l.replace(/^\s*[rRuU]?("""|\'\'\')/, "");
      block.push(first.split(q)[0]);
      i++;
      if (!first.includes(q)) {
        while (i < lines.length && !lines[i].includes(q)) block.push(lines[i++]);
        if (i < lines.length) block.push(lines[i++].split(q)[0]);
      }
    } else break;
    // The first paragraph only.
    const para = block.join("\n").trim().split(/\n\s*\n/)[0] ?? "";
    const joined = para.replace(/\s+/g, " ").trim();
    if (joined && !/copyright|licen[cs]e|spdx|all rights reserved|generated by/i.test(joined)) blocks.push(joined);
  }
  const doc = blocks[0];
  if (!doc || doc.length < 12 || /^[-=*#~_ ]+$/.test(doc)) return undefined;
  // Up to two sentences, at most ~220 characters.
  const sentences = doc.match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g) ?? [doc];
  let out = "";
  for (const s of sentences) {
    if (out && (out + s).length > 220) break;
    out += s;
    if (out.length > 120) break;
  }
  out = out.trim();
  return out.length > 240 ? out.slice(0, 237).replace(/\s+\S*$/, "") + "…" : out;
}
