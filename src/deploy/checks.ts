// Deploy readiness: plain checks with a clear status, the line they're about,
// why it matters, and what to change, described in words. The mentor never
// writes the fix; the student does.
import type { RepoIndex } from "../repo/types";
import { basename, gitignore } from "../repo/files";
import { redactSecrets } from "../tour/ai/redact";
import type { AppProfile, Located } from "./profile";

export type CheckStatus = "pass" | "warn" | "fail" | "n/a";

export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  where?: Located;
  why: string; // why it matters, for someone who has never deployed
  fix: string; // what to change, in words ("" when it passes)
}

const SERVER_KINDS = new Set(["api-server", "fullstack", "ssr-web", "worker"]);
const WEB_KINDS = new Set(["api-server", "fullstack", "ssr-web"]);
const BUILT_KINDS = new Set(["spa", "ssr-web", "fullstack"]);
const lineAt = (t: string, i: number) => t.slice(0, i).split("\n").length - 1;
const list = (xs: string[], max = 4) => xs.slice(0, max).map((x) => `\`${x}\``).join(", ") + (xs.length > max ? ` and ${xs.length - max} more` : "");

export function runChecks(index: RepoIndex, texts: Map<string, string | undefined>, p: AppProfile): Check[] {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const file = (re: RegExp) => index.files.find((f) => re.test(f.path));
  const npm = index.manifests.find((m) => m.kind === "npm" && !m.path.includes("/"));
  const server = SERVER_KINDS.has(p.kind);
  const web = WEB_KINDS.has(p.kind);

  // 1. How it's built.
  if (BUILT_KINDS.has(p.kind) && p.runtime === "node")
    add(
      p.build
        ? { id: "build", title: "There's a build command", status: "pass", where: npm && { path: npm.path, line: npm.scriptsLine ?? 0 }, why: "The host runs it to turn your source into what actually gets served.", fix: "" }
        : {
            id: "build",
            title: "There's a build command",
            status: "fail",
            where: npm && { path: npm.path, line: npm.scriptsLine ?? 0 },
            why: "The host needs one command that builds the app. Without it, it doesn't know how to make the files it should serve.",
            fix: 'Add a `"build"` script to `package.json` that runs your framework\'s build (check its docs for the exact command).',
          },
    );

  // 2. How it's started.
  if (server)
    add(
      p.start
        ? { id: "start", title: "There's a start command", status: "pass", where: p.startFrom ? { path: p.startFrom, line: 0 } : undefined, why: "The host runs this to start your server.", fix: "" }
        : {
            id: "start",
            title: "There's a start command",
            status: p.runtime === "python" ? "warn" : "fail",
            why: "A server host needs to know the one command that starts your app. Most look for `npm start`, a `Procfile`, or a Dockerfile `CMD`.",
            fix:
              p.runtime === "node"
                ? 'Add a `"start"` script to `package.json` that starts the server file.'
                : p.runtime === "python"
                  ? `Production servers don't run \`python app.py\`; they use a server like gunicorn or uvicorn${p.entryModule ? `, pointed at \`${p.entryModule}\`` : ""}. You'll type that as the start command on the host, or put it in a \`Procfile\`.`
                  : "Write down the command that starts the server: in the host's settings, a `Procfile`, or a Dockerfile `CMD`.",
          },
    );

  // 3. The port.
  if (web) {
    if (p.port?.fromEnv) add({ id: "port", title: "The server listens on the port the host gives it", status: "pass", where: p.port, why: "Hosts pick the port and pass it in the `PORT` environment variable.", fix: "" });
    else if (p.port)
      add({
        id: "port",
        title: "The server listens on the port the host gives it",
        status: "fail",
        where: p.port,
        why: `The port is fixed at ${p.port.value ?? "a number in the code"}. Most hosts choose the port themselves and tell your app through the \`PORT\` environment variable; if the app listens somewhere else, the host can't reach it and the deploy fails with a timeout.`,
        fix: "Read the port from the `PORT` environment variable, and keep your current number as the fallback when it isn't set (for running on your own computer).",
      });
    else add({ id: "port", title: "The server listens on the port the host gives it", status: "warn", why: "I couldn't find where the server picks its port. Hosts pass it in the `PORT` environment variable.", fix: "Find where the server starts listening and check it reads `PORT`." });
  }

  // 4. Listening on all interfaces.
  if (web) {
    const flaskRun = p.frameworks.includes("flask") && p.start && /python3?\s+\S+\.py/.test(p.start);
    if (p.bindsLocalhost || flaskRun)
      add({
        id: "host",
        title: "The server accepts connections from outside",
        status: "fail",
        where: p.bindsLocalhost ?? p.port,
        why: "A server listening on `localhost` (127.0.0.1) only answers requests from the same machine. On a host, requests come from outside, so they never arrive.",
        fix: flaskRun ? "Flask's built-in server is for development. Start it with a production server (gunicorn) instead, which listens on all interfaces when told `--bind 0.0.0.0`." : "Listen on `0.0.0.0` (all interfaces), or leave the host out so the default is used.",
      });
    else add({ id: "host", title: "The server accepts connections from outside", status: "pass", why: "It doesn't restrict itself to `localhost`.", fix: "" });
  }

  // 5. Environment variables are written down.
  if (p.env.length) {
    const missing = p.env.filter((e) => !p.envDocumented.includes(e.name));
    add(
      !missing.length
        ? { id: "env", title: "Every environment variable is written down", status: "pass", why: `The code reads ${list(p.env.map((e) => e.name))}, and each is listed where a deployer will look.`, fix: "" }
        : {
            id: "env",
            title: "Every environment variable is written down",
            status: "warn",
            where: missing[0],
            why: `The code reads ${list(missing.map((e) => e.name))}, but ${missing.length === 1 ? "it isn't" : "they aren't"} listed anywhere a deployer would look. You'll have to set each one on the host, and a missing one usually crashes the app at startup.`,
            fix: "List every name in a `.env.example` file (names only, with a comment on what each is for, and never the real values) so you and teammates know what to set.",
          },
    );
  }

  // 6. Secrets aren't committed.
  const envFile = index.files.find((f) => /^\.env(\.(local|production|prod|development|dev))?$/i.test(basename(f.path)));
  const ignore = texts.get(".gitignore");
  if (envFile) {
    const ignored = ignore !== undefined && gitignore(ignore)(envFile.path, false);
    add({
      id: "dotenv",
      title: "`.env` files stay out of git",
      status: ignored ? "pass" : "fail",
      // Never point at the .env file itself: "Show me" would open it on screen.
      where: ignored || ignore === undefined ? undefined : { path: ".gitignore", line: 0 },
      why: ignored ? "`.gitignore` keeps them out of the repository." : `\`${envFile.path}\` exists and \`.gitignore\` doesn't exclude it, so its passwords and keys could be pushed to GitHub, where bots find them within minutes.`,
      fix: ignored ? "" : "Add `.env` to `.gitignore`. If it was ever committed, change every key in it: deleting the file doesn't remove it from git history.",
    });
  }
  const leaks: Located[] = [];
  for (const f of index.files) {
    if ((f.kind !== "source" && f.kind !== "config") || /^\.env\.(example|sample|template|dist|defaults?)$/i.test(basename(f.path))) continue;
    const t = texts.get(f.path);
    if (!t || !redactSecrets(t).count) continue;
    const lines = t.split("\n");
    const at = lines.findIndex((l) => redactSecrets(l).count > 0);
    leaks.push({ path: f.path, line: Math.max(0, at) });
  }
  add(
    leaks.length
      ? {
          id: "keys",
          title: "No keys or passwords in the code",
          status: "fail",
          where: leaks[0],
          why: `Something that looks like a key or password is written into ${list(leaks.map((l) => l.path))}. Anyone who can see the repo can use it. (I'm not showing the value.)`,
          fix: "Move it into an environment variable, read it from there in the code, and change the key, since it has already been exposed.",
        }
      : { id: "keys", title: "No keys or passwords in the code", status: "pass", why: "Nothing in the code looks like a key or password.", fix: "" },
  );

  // 7. Dependencies are locked.
  if (p.runtime === "node") {
    const lock = file(/^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/);
    add(
      lock
        ? { id: "lock", title: "Dependency versions are locked", status: "pass", where: { path: lock.path, line: 0 }, why: "The host installs exactly the versions you tested with.", fix: "" }
        : { id: "lock", title: "Dependency versions are locked", status: "warn", why: "Without a lockfile, the host may install newer versions than you tested with, and something that worked for you breaks there.", fix: "Run `npm install` once and commit the `package-lock.json` it creates." },
    );
  } else if (p.runtime === "python") {
    const req = index.files.find((f) => /^requirements\.txt$/.test(f.path));
    const lock = file(/^(poetry\.lock|uv\.lock|Pipfile\.lock|pdm\.lock)$/);
    const unpinned = req ? (texts.get(req.path) ?? "").split("\n").filter((l) => l.trim() && !/^\s*[#-]/.test(l) && !/==/.test(l)) : [];
    if (!req && !lock && !index.manifests.some((m) => m.kind === "python" && m.deps.length))
      add({ id: "lock", title: "Dependencies are listed", status: "fail", why: "The host only installs what's listed. Without a `requirements.txt` (or `pyproject.toml`), it installs nothing and the app crashes on its first import.", fix: "List every package the code imports in `requirements.txt`, with versions." });
    else
      add(
        lock || (req && !unpinned.length)
          ? { id: "lock", title: "Dependency versions are pinned", status: "pass", where: { path: (lock ?? req)!.path, line: 0 }, why: "The host installs the versions you tested with.", fix: "" }
          : {
              id: "lock",
              title: "Dependency versions are pinned",
              status: "warn",
              where: req && { path: req.path, line: 0 },
              why: `${unpinned.length ? `${list(unpinned.map((l) => l.trim()))} ${unpinned.length === 1 ? "has" : "have"} no exact version, so` : "Without exact versions,"} the host may install a newer release than you tested with.`,
              fix: "Pin each package to the version you use (`name==1.2.3`). `pip freeze` shows what's installed.",
            },
      );
  }

  // 8. The language version is pinned.
  if (server || BUILT_KINDS.has(p.kind)) {
    if (p.runtime === "node") {
      const pinned = (npm && /"engines"\s*:/.test(texts.get(npm.path) ?? "")) || file(/^\.(nvmrc|node-version|tool-versions)$/);
      add(
        pinned
          ? { id: "runtime", title: "The Node.js version is pinned", status: "pass", why: "The host uses the same Node.js version you do.", fix: "" }
          : { id: "runtime", title: "The Node.js version is pinned", status: "warn", why: "Hosts pick a default Node.js version, which may differ from yours; newer syntax or packages can then fail.", fix: 'Add an `"engines"` field to `package.json` (or an `.nvmrc` file) with the major version you use.' },
      );
    } else if (p.runtime === "python") {
      const pinned = file(/^(\.python-version|runtime\.txt|\.tool-versions)$/) || index.files.some((f) => basename(f.path) === "pyproject.toml" && /requires-python/.test(texts.get(f.path) ?? "")) || index.files.some((f) => /^dockerfile$/i.test(basename(f.path)) && /FROM\s+python:\d/.test(texts.get(f.path) ?? ""));
      add(
        pinned
          ? { id: "runtime", title: "The Python version is pinned", status: "pass", why: "The host uses the same Python version you do.", fix: "" }
          : { id: "runtime", title: "The Python version is pinned", status: "warn", why: "Hosts pick a default Python version, which may differ from yours.", fix: "Add a `.python-version` file with the version you use (for example `3.12`)." },
      );
    }
  }

  // 9. Debug mode is off.
  const flaskDebug = findIn(index, texts, /app\.run\([^)]*debug\s*=\s*True/);
  const djangoDebug = findIn(index, texts, /^DEBUG\s*=\s*True\b/m, (p) => basename(p) === "settings.py");
  const debug = flaskDebug ?? djangoDebug;
  if (p.frameworks.includes("flask") || p.frameworks.includes("django"))
    add(
      debug
        ? {
            id: "debug",
            title: "Debug mode is off in production",
            status: "fail",
            where: debug,
            why: "Debug mode shows anyone your code and settings when something goes wrong, and Flask's debugger even lets visitors run Python on your server.",
            fix: "Turn debug on only when an environment variable says so (for example `DEBUG=1` on your own computer), so it's off on the host by default.",
          }
        : { id: "debug", title: "Debug mode is off in production", status: "pass", why: "Debug mode isn't switched on in the code.", fix: "" },
    );

  // 10. The database.
  if (p.db && server) {
    if (p.db.kind === "sqlite")
      add({
        id: "db",
        title: "The data survives a redeploy",
        status: "warn",
        why: "The app stores its data in a SQLite file. On most hosts the disk is wiped on every deploy or restart, so the data would vanish.",
        fix: "Use a hosted database (most hosts offer PostgreSQL), or a host with a persistent disk (a volume) for the SQLite file.",
      });
    else {
      const migrations = index.files.some((f) => f.kind === "migration") || index.files.some((f) => /(^|\/)(alembic\.ini|schema\.prisma)$/.test(f.path));
      add(
        migrations
          ? { id: "db", title: "Database tables are created by migrations", status: "pass", why: `It uses ${p.db.kind} (${p.db.evidence}) and has migrations, so the tables can be created on the new database.`, fix: "" }
          : {
              id: "db",
              title: "Database tables are created by migrations",
              status: "warn",
              why: `It uses ${p.db.kind} (${p.db.evidence}), but I found no migrations. A new database starts empty: how will the tables get created there?`,
              fix: "Check how the tables are made today. If it's by hand, write the steps down, or use your framework's migration tool so the deploy can run them.",
            },
      );
    }
  }

  // 11. A health check.
  if (web) {
    const health = index.files.flatMap((f) => f.routes.filter((r) => /^\/(api\/)?(health|healthz|healthcheck|ping|status|ready|live)\/?$/i.test(r.path)).map((r) => ({ path: f.path, line: r.line })))[0];
    add(
      health
        ? { id: "health", title: "There's a health check address", status: "pass", where: health, why: "Hosts can call it to see the app is up, and restart it if not.", fix: "" }
        : { id: "health", title: "There's a health check address", status: "warn", why: "Many hosts check an address like `/health` to know your app started. Without one, they only check that something answers.", fix: "Optional: add a route like `/health` that answers \"ok\"." },
    );
  }

  // 12. Django's allowed hosts.
  const allowed = findIn(index, texts, /^ALLOWED_HOSTS\s*=\s*\[\s*\]/m, (x) => basename(x) === "settings.py");
  if (allowed)
    add({
      id: "allowed-hosts",
      title: "Django knows its public address",
      status: "fail",
      where: allowed,
      why: "`ALLOWED_HOSTS` is empty, so with debug off Django refuses every request (\"Bad Request (400)\").",
      fix: "Read the allowed host names from an environment variable and set it to your site's address on the host.",
    });

  // 13. Build output stays out of git.
  if (BUILT_KINDS.has(p.kind) && p.outDir && p.outDir !== ".") {
    const ignored = ignore !== undefined && gitignore(ignore)(p.outDir, true);
    add(
      ignored
        ? { id: "build-output", title: "Build output isn't committed", status: "pass", why: `\`${p.outDir}/\` is in \`.gitignore\`; the host builds it fresh.`, fix: "" }
        : { id: "build-output", title: "Build output isn't committed", status: "warn", where: ignore !== undefined ? { path: ".gitignore", line: 0 } : undefined, why: `\`${p.outDir}/\` isn't in \`.gitignore\`. Committed build files go stale and make every change look huge.`, fix: `Add \`${p.outDir}/\` to \`.gitignore\`; the host runs the build itself.` },
      );
  }

  // 14. A Dockerfile has a start command.
  const dockerfile = index.files.find((f) => /^dockerfile$/i.test(basename(f.path)));
  if (dockerfile) {
    const t = texts.get(dockerfile.path) ?? "";
    add(
      /^\s*(CMD|ENTRYPOINT)\b/im.test(t)
        ? { id: "docker", title: "The Dockerfile says how to start", status: "pass", where: { path: dockerfile.path, line: lineAt(t, t.search(/^\s*(CMD|ENTRYPOINT)\b/im)) }, why: "It ends with the command that starts the app.", fix: "" }
        : { id: "docker", title: "The Dockerfile says how to start", status: "fail", where: { path: dockerfile.path, line: 0 }, why: "There's no `CMD` or `ENTRYPOINT`, so the container starts and immediately stops.", fix: "End the Dockerfile with a `CMD` that runs your start command." },
    );
  }
  return checks;
}

function findIn(index: RepoIndex, texts: Map<string, string | undefined>, re: RegExp, filter: (p: string) => boolean = () => true): Located | undefined {
  for (const f of index.files) {
    if (f.kind !== "source" || !filter(f.path)) continue;
    const t = texts.get(f.path) ?? "";
    const m = re.exec(t);
    if (m) return { path: f.path, line: lineAt(t, m.index) };
  }
  return undefined;
}
