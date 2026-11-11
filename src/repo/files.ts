// What kind of file is this, which language, and is it safe to read?
// Pure functions: no VS Code, no file system.
import type { FileKind } from "./types";

/** Folders that are never part of the code someone wrote: installed packages, build output, caches. */
export const IGNORED_DIRS = new Set([
  "node_modules", "bower_components", ".git", ".hg", ".svn",
  "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".angular", ".expo", ".vercel", ".netlify", ".serverless",
  ".venv", "venv", "env", "site-packages", "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", ".ipynb_checkpoints",
  "target", "obj", ".gradle", "Pods", "DerivedData", ".dart_tool", ".terraform",
  "coverage", ".nyc_output", ".idea", ".vscode-test", ".turbo", ".cache", ".parcel-cache", ".yarn",
]);

const LANGUAGES: Record<string, string> = {
  py: "Python", pyi: "Python", ipynb: "Jupyter",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  vue: "Vue", svelte: "Svelte",
  java: "Java", kt: "Kotlin", kts: "Kotlin", scala: "Scala",
  go: "Go", rs: "Rust", c: "C", h: "C", cpp: "C++", cc: "C++", cxx: "C++", hpp: "C++", hh: "C++",
  cs: "C#", rb: "Ruby", php: "PHP", swift: "Swift", m: "Objective-C", dart: "Dart", lua: "Lua", r: "R", jl: "Julia",
  html: "HTML", htm: "HTML", css: "CSS", scss: "CSS", sass: "CSS", less: "CSS",
  sh: "Shell", bash: "Shell", zsh: "Shell", ps1: "PowerShell", sql: "SQL", graphql: "GraphQL", proto: "Protobuf",
  md: "Markdown", mdx: "Markdown", rst: "reStructuredText",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
};

/** Languages whose files count as code someone wrote (not data or docs). */
const CODE_LANGUAGES = new Set([
  "Python", "Jupyter", "JavaScript", "TypeScript", "Vue", "Svelte", "Java", "Kotlin", "Scala", "Go", "Rust", "C", "C++", "C#",
  "Ruby", "PHP", "Swift", "Objective-C", "Dart", "Lua", "R", "Julia", "HTML", "CSS", "Shell", "PowerShell", "SQL", "GraphQL", "Protobuf",
]);

const MEDIA = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff", "svg", "psd", "mp3", "mp4", "mov", "avi", "wav", "ogg", "webm", "flac", "woff", "woff2", "ttf", "otf", "eot"]);
const BINARY = new Set([
  ...MEDIA, "pdf", "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "jar", "war", "class", "so", "dylib", "dll", "exe", "bin", "o", "a",
  "sqlite", "sqlite3", "db", "pyc", "pyo", "whl", "dmg", "iso", "apk", "ipa", "aab", "vsix", "wasm", "pkl", "npy", "parquet", "h5",
]);
const LOCKFILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "poetry.lock", "Pipfile.lock", "uv.lock", "Cargo.lock", "go.sum", "Gemfile.lock", "composer.lock", "pubspec.lock", "Podfile.lock", "gradle.lockfile"]);
const DOC_NAMES = /^(readme|license|licence|changelog|contributing|code_of_conduct|security|authors|notice|history)(\.\w+)?$/i;
const CONFIG_NAMES = /^(dockerfile|makefile|procfile|gemfile|pipfile|rakefile|vagrantfile|jenkinsfile|cmakelists\.txt|requirements.*\.txt|\.[\w.-]+rc|\.[\w-]+ignore|\.editorconfig|\.gitattributes|\.nvmrc|\.python-version|runtime\.txt|go\.mod|setup\.py|setup\.cfg|manage\.py)$/i;

export const ext = (path: string) => {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
};
export const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
export const dirname = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

export function languageOf(path: string): string | undefined {
  if (/^dockerfile$/i.test(basename(path))) return "Dockerfile";
  return LANGUAGES[ext(path)];
}

export function isCodeLanguage(language: string | undefined): boolean {
  return !!language && CODE_LANGUAGES.has(language);
}

/** Files the mentor never opens, because they usually hold passwords or keys. */
export function isSecretPath(path: string): boolean {
  const base = basename(path);
  if (/^\.env(\..+)?$/i.test(base) && !/\.(example|sample|template|dist|defaults?)$/i.test(base)) return true;
  if (/\.(pem|key|p12|pfx|jks|keystore|crt|cer|der|asc|gpg|kdbx)$/i.test(base)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)/.test(base)) return true;
  if (/^(credentials|service[-_]?account|client[-_]?secret).*\.json$/i.test(base)) return true;
  if (/^(\.npmrc|\.pypirc|\.netrc|\.htpasswd|\.git-credentials)$/i.test(base)) return true;
  return /^secrets?\.(json|ya?ml|toml|env)$/i.test(base);
}

export function isBinaryPath(path: string): boolean {
  return BINARY.has(ext(path)) || basename(path) === "bun.lockb";
}

const isTestPath = (path: string) => {
  const base = basename(path);
  return (
    /(^|\/)(tests?|__tests__|spec|specs|e2e|cypress|playwright)\//i.test(path) ||
    /^test_.*\.py$|_test\.(py|go)$|\.(test|spec)\.[cm]?[jt]sx?$|Tests?\.(java|kt|cs|swift)$|_spec\.rb$/.test(base)
  );
};

/** What kind of file this is, and, for files a student can skip, why. `head` is the start of its text, if read. */
export function classify(path: string, head = ""): { kind: FileKind; why?: string } {
  const base = basename(path);
  const e = ext(path);
  if (isSecretPath(path)) return { kind: "secret", why: "may hold passwords or keys, so the mentor never opens it" };
  if (LOCKFILES.has(base)) return { kind: "generated", why: "a lockfile: the package manager writes it, nobody edits it by hand" };
  if (/(^|\/)(vendor|third[_-]party|external|extern)\//i.test(path)) return { kind: "vendored", why: "someone else's code, copied into this repo" };
  if (/\.min\.(js|css)$|\.map$|_pb2(_grpc)?\.py$|\.pb\.go$|\.generated\.\w+$|\.g\.dart$|\.freezed\.dart$/.test(base))
    return { kind: "generated", why: "generated by a tool, not written by hand" };
  if (/(^|\/)(migrations|alembic\/versions|db\/migrate)\//.test(path))
    return { kind: "migration", why: "database changes recorded in order; you only need the newest when you change the database" };
  if (MEDIA.has(e)) return { kind: "asset", why: "an image, font or media file" };
  if (BINARY.has(e)) return { kind: "other", why: "a binary file, not code you read" };
  if (/@generated|auto-?generated|do not edit/i.test(head.slice(0, 400))) return { kind: "generated", why: "says it was generated by a tool" };
  if (isTestPath(path)) return { kind: "test" };
  if (DOC_NAMES.test(base) || ["md", "mdx", "rst", "adoc", "txt"].includes(e) && !/^requirements/i.test(base)) return { kind: "doc" };
  if (/\.d\.ts$/.test(base)) return { kind: "config", why: "type declarations only, no logic" };
  if (CONFIG_NAMES.test(base) && !/^(setup|manage)\.py$/.test(base)) return { kind: "config" };
  if (/\.(config|conf)\.[cm]?[jt]s$|^tsconfig.*\.json$|^jsconfig\.json$/.test(base)) return { kind: "config" };
  if (["json", "yaml", "yml", "toml", "ini", "cfg", "conf", "xml", "properties", "lock", "plist", "gradle", "env", "example"].includes(e)) return { kind: "config" };
  if (base.startsWith(".")) return { kind: "config" };
  if (isCodeLanguage(languageOf(path)) || /^(setup|manage)\.py$/.test(base)) return { kind: "source" };
  return { kind: "other" };
}

// ------------------------------------------------------------------ .gitignore

/** A matcher for one .gitignore file at the repo root. Supports *, **, ?, leading /, trailing / and !negation. */
export function gitignore(text: string): (path: string, isDir: boolean) => boolean {
  const rules: { re: RegExp; negate: boolean; dirOnly: boolean }[] = [];
  for (let raw of text.split(/\r?\n/)) {
    raw = raw.replace(/\s+$/, "");
    if (!raw || raw.startsWith("#")) continue;
    let negate = false;
    if (raw.startsWith("!")) {
      negate = true;
      raw = raw.slice(1);
    }
    let dirOnly = false;
    if (raw.endsWith("/")) {
      dirOnly = true;
      raw = raw.slice(0, -1);
    }
    const anchored = raw.startsWith("/") || raw.slice(0, -1).includes("/");
    raw = raw.replace(/^\//, "");
    let re = "";
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === "*" && raw[i + 1] === "*") {
        if (raw[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else if (c === "*") re += "[^/]*";
      else if (c === "?") re += "[^/]";
      else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    rules.push({ re: new RegExp(`${anchored ? "^" : "(?:^|/)"}${re}$`), negate, dirOnly });
  }
  return (path, isDir) => {
    let ignored = false;
    for (const r of rules) if ((!r.dirOnly || isDir) && r.re.test(path)) ignored = !r.negate;
    return ignored;
  };
}
