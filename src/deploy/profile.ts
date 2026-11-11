// What kind of app is this, and what does deploying it need? Worked out from
// the repo index and the files, never guessed by an AI model. Pure functions.
import type { RepoIndex } from "../repo/types";
import { basename } from "../repo/files";

export type AppKind = "static-site" | "spa" | "ssr-web" | "api-server" | "fullstack" | "worker" | "cli" | "library" | "mobile" | "desktop" | "notebook" | "unknown";
export type Runtime = "node" | "python" | "go" | "java" | "rust" | "ruby" | "php" | "static" | "other";

export const KIND_WORDS: Record<AppKind, string> = {
  "static-site": "a static website (HTML, CSS and maybe some JavaScript, no server code)",
  spa: "a single-page web app: the build turns it into static files the browser runs",
  "ssr-web": "a web app whose pages are rendered on a server",
  "api-server": "a web server that answers requests",
  fullstack: "a web app with both a server and pages for the browser",
  worker: "a background program that runs jobs, with no web pages",
  cli: "a command-line tool",
  library: "a library other code installs and uses",
  mobile: "a phone app",
  desktop: "a desktop app",
  notebook: "Jupyter notebooks",
  unknown: "a project whose kind I couldn't tell",
};

export interface Located {
  path: string;
  line: number; // 0-based
}

export interface EnvUse extends Located {
  name: string;
}

export interface AppProfile {
  kind: AppKind;
  runtime: Runtime;
  evidence: string[];
  frameworks: string[]; // framework ids from the index
  /** Deploy config already in the repo, and the platform it's for. */
  configs: { target: string; path: string }[];
  build?: string; // the build command, if there is one
  start?: string; // how it's started in production, if the repo says
  startFrom?: string; // where `start` came from
  port?: Located & { fromEnv: boolean; value?: string };
  bindsLocalhost?: Located;
  db?: { kind: "postgres" | "mysql" | "sqlite" | "mongo" | "redis"; evidence: string };
  env: EnvUse[]; // environment variables the code reads (not the platform's own)
  envDocumented: string[]; // names listed in .env.example, docker-compose, fly.toml…
  outDir?: string; // where the build puts static files
  entryModule?: string; // python: "app:app" for gunicorn/uvicorn
}

const CONFIG_FILES: [RegExp, string][] = [
  [/^dockerfile$/i, "docker"],
  [/^docker-compose\.ya?ml$|^compose\.ya?ml$/i, "docker"],
  [/^procfile$/i, "heroku"],
  [/^vercel\.json$/, "vercel"],
  [/^netlify\.toml$/, "netlify"],
  [/^fly\.toml$/, "fly"],
  [/^render\.ya?ml$/, "render"],
  [/^railway\.(json|toml)$/, "railway"],
  [/^app\.ya?ml$/, "app-engine"],
  [/^wrangler\.toml$/, "cloudflare"],
  [/^firebase\.json$/, "firebase"],
  [/^serverless\.ya?ml$/, "serverless"],
  [/^amplify\.ya?ml$/, "amplify"],
  [/^nixpacks\.toml$/, "railway"],
  [/^app\.json$/, "heroku"],
];

/** Environment variables the platform sets, or that only matter on your own machine. */
const PLATFORM_ENV = /^(PORT|NODE_ENV|HOME|PATH|PWD|USER|SHELL|TERM|HOSTNAME|HOST|CI|DEBUG|TZ|LANG|PYTHONPATH|PYTHONUNBUFFERED|VIRTUAL_ENV|GITHUB_\w+|VERCEL\w*|NETLIFY\w*|RENDER\w*|FLY_\w+|RAILWAY_\w+|HEROKU_\w+|K_SERVICE|K_REVISION|GOOGLE_CLOUD_PROJECT|AWS_REGION|AWS_LAMBDA_\w+|DYNO|npm_\w+|NEXT_RUNTIME|VITE_\w*_MODE|MODE|BASE_URL|DEV|PROD|SSR)$/;

const ENV_PATTERNS: RegExp[] = [
  /process\.env\.([A-Z][A-Z0-9_]+)/g,
  /process\.env\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]+)/g,
  /os\.environ\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\]/g,
  /os\.environ\.get\(\s*["']([A-Z][A-Z0-9_]+)["']/g,
  /os\.getenv\(\s*["']([A-Z][A-Z0-9_]+)["']/g,
  /\benv\(\s*["']([A-Z][A-Z0-9_]+)["']/g,
  /os\.(?:Getenv|LookupEnv)\(\s*"([A-Z][A-Z0-9_]+)"/g,
  /env::var\(\s*"([A-Z][A-Z0-9_]+)"/g,
  /System\.getenv\(\s*"([A-Z][A-Z0-9_]+)"/g,
  /ENV(?:\.fetch\(\s*|\[\s*)["']([A-Z][A-Z0-9_]+)["']/g,
  /getenv\(\s*["']([A-Z][A-Z0-9_]+)["']/g,
  /Deno\.env\.get\(\s*["']([A-Z][A-Z0-9_]+)["']/g,
];

const lineAt = (text: string, i: number) => text.slice(0, i).split("\n").length - 1;

export function envReads(index: RepoIndex, texts: Map<string, string | undefined>): EnvUse[] {
  const out: EnvUse[] = [];
  for (const f of index.files) {
    if (f.kind !== "source" || !f.read) continue;
    const t = texts.get(f.path) ?? "";
    for (const re of ENV_PATTERNS)
      for (const m of t.matchAll(re)) if (!PLATFORM_ENV.test(m[1]) && !out.some((e) => e.name === m[1])) out.push({ name: m[1], path: f.path, line: lineAt(t, m.index!) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Names written down somewhere a deployer would look: .env.example, compose files, platform configs, the README. */
export function envDocumented(index: RepoIndex, texts: Map<string, string | undefined>, names: string[]): string[] {
  const docs = index.files
    .filter((f) => /^\.env\.(example|sample|template|dist|defaults?)$/i.test(basename(f.path)) || /^(docker-compose|compose)\.ya?ml$|^(fly|netlify|wrangler)\.toml$|^(render|app)\.ya?ml$|^app\.json$|^vercel\.json$|^readme/i.test(basename(f.path)) || /^\.github\/workflows\//.test(f.path))
    .map((f) => texts.get(f.path) ?? "")
    .join("\n");
  return names.filter((n) => new RegExp(`\\b${n}\\b`).test(docs));
}

function firstMatch(index: RepoIndex, texts: Map<string, string | undefined>, re: RegExp, filter: (p: string) => boolean = () => true): (Located & { m: RegExpExecArray }) | undefined {
  for (const f of index.files) {
    if (!f.read || !filter(f.path)) continue;
    const t = texts.get(f.path) ?? "";
    re.lastIndex = 0;
    const m = re.exec(t);
    if (m) return { path: f.path, line: lineAt(t, m.index), m };
  }
  return undefined;
}

export function profileApp(index: RepoIndex, texts: Map<string, string | undefined>): AppProfile {
  const fw = new Set(index.frameworks.map((f) => f.id));
  const deps = new Set(index.manifests.flatMap((m) => m.deps));
  const kinds = new Set(index.manifests.map((m) => m.kind));
  const src = index.files.filter((f) => f.kind === "source");
  const has = (p: RegExp) => index.files.some((f) => p.test(f.path));
  const evidence: string[] = [];
  const code = (re: RegExp, filter?: (p: string) => boolean) => firstMatch(index, texts, re, (p) => (filter ? filter(p) : true) && index.files.find((f) => f.path === p)?.kind === "source");

  const runtime: Runtime = kinds.has("npm")
    ? "node"
    : kinds.has("python") || src.some((f) => f.language === "Python")
      ? "python"
      : kinds.has("go")
        ? "go"
        : kinds.has("maven") || kinds.has("gradle")
          ? "java"
          : kinds.has("cargo")
            ? "rust"
            : kinds.has("ruby")
              ? "ruby"
              : kinds.has("php")
                ? "php"
                : src.length && src.every((f) => ["HTML", "CSS", "JavaScript"].includes(f.language ?? ""))
                  ? "static"
                  : "other";

  const serverFw = ["express", "fastify", "nestjs", "koa", "flask", "django", "fastapi", "gin", "echo", "fiber", "spring", "axum", "actix", "rails", "laravel"].filter((x) => fw.has(x));
  const goServer = code(/\bhttp\.ListenAndServe\(|\.Run\(\s*":\d+"\s*\)/);
  const uiFw = ["react", "vue", "svelte", "angular"].filter((x) => fw.has(x));
  let kind: AppKind = "unknown";
  if (fw.has("electron")) kind = "desktop";
  else if (fw.has("react-native") || fw.has("expo") || has(/(^|\/)pubspec\.yaml$/) || has(/(^|\/)AndroidManifest\.xml$/)) kind = "mobile";
  else if (fw.has("next") || fw.has("streamlit")) kind = fw.has("prisma") || src.some((f) => f.routes.some((r) => r.method !== "PAGE")) ? "fullstack" : "ssr-web";
  else if (serverFw.length || goServer) {
    kind = uiFw.length || has(/(^|\/)templates\/.+\.html$/) ? "fullstack" : "api-server";
    if (serverFw.length) evidence.push(`uses ${index.frameworks.filter((f) => serverFw.includes(f.id)).map((f) => f.name).join(", ")}`);
    if (goServer) evidence.push(`\`${goServer.path}\` starts a web server`);
  } else if (uiFw.length) {
    kind = "spa";
    evidence.push(`uses ${index.frameworks.filter((f) => uiFw.includes(f.id)).map((f) => f.name).join(", ")} with no server code`);
  } else if (index.manifests.some((m) => m.entries.some((e) => /command/.test(e.why))) || code(/argparse|click\.command|typer\.Typer|commander|yargs|cobra\.Command|clap::/)) kind = "cli";
  else if (src.filter((f) => f.language === "Jupyter").length > src.length / 2) kind = "notebook";
  else if (code(/\bcelery\b|\bBullMQ\b|new\s+Queue\(|schedule\.every|cron\.schedule|@Scheduled/)) kind = "worker";
  else if (runtime === "static" || (src.length && src.every((f) => ["HTML", "CSS"].includes(f.language ?? "")))) kind = "static-site";
  else if (index.manifests.length && !src.some((f) => f.entry)) kind = "library";
  if (kind === "fullstack" && has(/(^|\/)templates\/.+\.html$/)) evidence.push("has HTML templates the server fills in");
  if (kind === "cli") evidence.push("defines a command you run in a terminal");
  if (kind === "spa" && fw.has("vite")) evidence.push("is built with Vite");

  // Deploy config already there.
  const configs = index.files.flatMap((f) => {
    const hit = CONFIG_FILES.find(([re]) => re.test(basename(f.path)) && f.path.split("/").length <= 2);
    return hit ? [{ target: hit[1], path: f.path }] : [];
  });
  for (const f of index.files.filter((x) => /^\.github\/workflows\/.+\.ya?ml$/.test(x.path))) {
    const t = texts.get(f.path) ?? "";
    const m = /(fly|vercel|netlify|render|railway|heroku|gcloud run|pages)[\w-]*\s+deploy|deploy-pages|actions\/deploy-pages|peaceiris\/actions-gh-pages/i.exec(t);
    if (m) configs.push({ target: /pages/i.test(m[0]) ? "github-pages" : m[1].toLowerCase().replace("gcloud run", "cloud-run"), path: f.path });
  }

  // Build and start commands.
  const npm = index.manifests.find((m) => m.kind === "npm" && !m.path.includes("/")) ?? index.manifests.find((m) => m.kind === "npm");
  let build: string | undefined;
  let start: string | undefined;
  let startFrom: string | undefined;
  if (npm?.scripts.build) build = "npm run build";
  const procfile = index.files.find((f) => /^procfile$/i.test(basename(f.path)));
  const procWeb = procfile && /^web:\s*(.+)$/m.exec(texts.get(procfile.path) ?? "");
  const docker = index.files.find((f) => /^dockerfile$/i.test(basename(f.path)));
  const dockerCmd = docker && /^\s*(?:CMD|ENTRYPOINT)\s+(.+)$/im.exec(texts.get(docker.path) ?? "");
  if (procWeb) [start, startFrom] = [procWeb[1].trim(), procfile!.path];
  else if (npm?.scripts.start) [start, startFrom] = ["npm start", npm.path];
  else if (dockerCmd) [start, startFrom] = [dockerCmd[1].trim().replace(/^\[|\]$/g, "").replace(/",\s*"/g, " ").replace(/"/g, "").replace(/^(ba)?sh -c\s+/, ""), docker!.path];
  if (runtime === "go" && !build) {
    // Build the program the start command runs: `web: ./server` → go build -o server ./cmd/server
    const main = index.files.find((f) => f.language === "Go" && f.entry && f.bucket === "start");
    const bin = start?.match(/^\.\/([\w.-]+)/)?.[1] ?? "app";
    build = `go build -o ${bin} ./${main && main.path.includes("/") ? main.path.slice(0, main.path.lastIndexOf("/")) : ""}`.replace(/\/$/, "/.");
  }

  // Python web apps: the module and variable gunicorn/uvicorn would load.
  let entryModule: string | undefined;
  if (runtime === "python") {
    const appVar = code(/^(\w+)\s*=\s*(?:flask\.)?(Flask|FastAPI)\(/m);
    if (appVar) entryModule = `${appVar.path.replace(/\.py$/, "").replace(/^src\//, "").replace(/\//g, ".")}:${appVar.m[1]}`;
    if (fw.has("django")) {
      const wsgi = index.files.find((f) => basename(f.path) === "wsgi.py");
      if (wsgi) entryModule = `${wsgi.path.replace(/\.py$/, "").replace(/\//g, ".")}:application`;
    }
  }

  // The port: read from the environment (good), or hard-coded (a problem on most hosts).
  const fromEnvRe = /process\.env\.PORT|os\.environ(?:\.get\(|\[)\s*["']PORT|os\.getenv\(\s*["']PORT|os\.Getenv\(\s*"PORT"|env::var\(\s*"PORT"|System\.getenv\(\s*"PORT"|ENV\.fetch\(\s*["']PORT|\$\{?PORT\b|server\.port=\$\{PORT/;
  let port: AppProfile["port"];
  const envPort = code(fromEnvRe) ?? firstMatch(index, texts, fromEnvRe, (p) => /^(dockerfile|procfile)$/i.test(basename(p)) || /^(fly\.toml|render\.ya?ml|app\.json)$/.test(basename(p)));
  if (envPort) port = { path: envPort.path, line: envPort.line, fromEnv: true };
  else {
    const hard =
      code(/\.listen\(\s*(\d{2,5})\b/) ??
      code(/app\.run\([^)]*port\s*=\s*(\d{2,5})/) ??
      code(/uvicorn\.run\([^)]*port\s*=\s*(\d{2,5})/) ??
      code(/ListenAndServe\(\s*":(\d{2,5})"/) ??
      code(/\.Run\(\s*":(\d{2,5})"\s*\)/) ??
      code(/^(?:const|let|var)\s+port\s*=\s*(\d{2,5})\b/im) ??
      code(/^PORT\s*=\s*(\d{2,5})\b/m);
    if (hard) port = { path: hard.path, line: hard.line, fromEnv: false, value: hard.m[1] };
    else if (fw.has("flask") && code(/\bapp\.run\(/)) {
      const r = code(/\bapp\.run\(/)!;
      port = { path: r.path, line: r.line, fromEnv: false, value: "5000" };
    }
  }
  const local = code(/\.listen\([^)]*["'](?:localhost|127\.0\.0\.1)["']|host\s*=\s*["'](?:localhost|127\.0\.0\.1)["']|ListenAndServe\(\s*"(?:localhost|127\.0\.0\.1):/);
  const bindsLocalhost = local ? { path: local.path, line: local.line } : undefined;

  // The database it talks to.
  let db: AppProfile["db"];
  const depDb: [RegExp, NonNullable<AppProfile["db"]>["kind"]][] = [
    [/^(pg|postgres|psycopg2?(-binary)?|asyncpg|github\.com\/lib\/pq|github\.com\/jackc\/pgx.*|org\.postgresql:postgresql)$/, "postgres"],
    [/^(mysql2?|pymysql|mysqlclient|github\.com\/go-sql-driver\/mysql)$/, "mysql"],
    [/^(mongoose|mongodb|pymongo|motor)$/, "mongo"],
    [/^(redis|ioredis)$/, "redis"],
    [/^(sqlite3|better-sqlite3)$/, "sqlite"],
  ];
  for (const [re, k] of depDb) {
    const d = [...deps].find((x) => re.test(x));
    if (d) {
      db = { kind: k, evidence: `\`${d}\` in the dependencies` };
      break;
    }
  }
  const sqliteUrl = code(/sqlite:\/\/\/|\.sqlite3?["']|\bsqlite3\.connect\(/);
  if (!db && sqliteUrl) db = { kind: "sqlite", evidence: `\`${sqliteUrl.path}\` uses a SQLite file` };
  if (!db && fw.has("prisma")) {
    const schema = index.files.find((f) => basename(f.path) === "schema.prisma");
    const prov = schema && /provider\s*=\s*"(postgresql|mysql|sqlite|mongodb)"/.exec(texts.get(schema.path) ?? "");
    if (prov) db = { kind: prov[1] === "postgresql" ? "postgres" : prov[1] === "mongodb" ? "mongo" : (prov[1] as "mysql" | "sqlite"), evidence: "`schema.prisma`" };
  }

  const env = envReads(index, texts);
  const outDir = fw.has("vite") ? "dist" : fw.has("angular") ? "dist" : fw.has("react") && deps.has("react-scripts") ? "build" : runtime === "static" ? "." : undefined;
  return { kind, runtime, evidence, frameworks: [...fw], configs, build, start, startFrom, port, bindsLocalhost, db, env, envDocumented: envDocumented(index, texts, env.map((e) => e.name)), outDir, entryModule };
}
