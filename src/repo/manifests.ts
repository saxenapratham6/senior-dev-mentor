// Package manifests (package.json, pyproject.toml, go.mod…) and the
// frameworks their dependencies reveal. Pure functions.
import { basename, dirname } from "./files";
import type { Framework, Manifest } from "./types";

const MANIFEST_NAMES = new Set(["package.json", "pyproject.toml", "setup.py", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json"]);

export function isManifest(path: string): boolean {
  const base = basename(path);
  return MANIFEST_NAMES.has(base) || /^requirements.*\.txt$/i.test(base);
}

const lineOf = (text: string, index: number) => (index < 0 ? undefined : text.slice(0, index).split("\n").length - 1);
const depName = (spec: string) => spec.trim().replace(/^["']|["']$/g, "").match(/^[A-Za-z0-9_.@/\-]+/)?.[0].toLowerCase().replace(/_/g, "-") ?? "";

/** The [section] blocks of a TOML file, as raw text. Enough for the few keys we read. */
function tomlSections(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let name = "";
  let body: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (h) {
      out.set(name, body.join("\n"));
      name = h[1].trim();
      body = [];
    } else body.push(line);
  }
  out.set(name, body.join("\n"));
  return out;
}

const tomlString = (section: string | undefined, key: string) => section?.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']*)["']`, "m"))?.[1];
const tomlArray = (section: string | undefined, key: string) => {
  // Up to the "]" that ends a line, so extras like "uvicorn[standard]" don't end the list early.
  const m = section?.match(new RegExp(`^\\s*${key}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:#.*)?$`, "m"));
  return m ? [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : [];
};
const tomlKeys = (section: string | undefined) =>
  section ? [...section.matchAll(/^\s*([A-Za-z0-9_.\-]+)\s*=/gm)].map((m) => m[1]).filter((k) => k !== "python") : [];
const tomlPairs = (section: string | undefined) =>
  section ? [...section.matchAll(/^\s*["']?([\w.\-]+)["']?\s*=\s*["']([^"']+)["']/gm)].map((m) => [m[1], m[2]] as const) : [];

/** Files a start command runs, e.g. "node src/server.js" → src/server.js. */
function filesInCommand(cmd: string): string[] {
  const out: string[] = [];
  for (const m of cmd.matchAll(/(?:^|[\s;&|])(?:node|nodemon|ts-node|tsx|bun|deno run|python3?|uvicorn|gunicorn|flask --app|electron)\s+(?:-[\w-]+(?:[ =]\S+)?\s+)*([\w./@:-]+)/g)) {
    let target = m[1];
    if (/^(uvicorn|gunicorn)/.test(m[0].trim()) || target.includes(":")) target = target.split(":")[0].replace(/\./g, "/") + ".py";
    out.push(target.replace(/^\.\//, ""));
  }
  return out;
}

export function parseManifest(path: string, text: string): Manifest | undefined {
  const base = basename(path);
  const dir = dirname(path);
  const join = (p: string) => (dir ? `${dir}/${p.replace(/^\.\//, "")}` : p.replace(/^\.\//, ""));
  try {
    if (base === "package.json") {
      const j = JSON.parse(text);
      const scripts: Record<string, string> = j.scripts && typeof j.scripts === "object" ? j.scripts : {};
      const entries: Manifest["entries"] = [];
      if (typeof j.main === "string") entries.push({ file: join(j.main), why: `\`package.json\` names it as the package's \`main\` file` });
      const bins = typeof j.bin === "string" ? { [j.name ?? "cli"]: j.bin } : j.bin && typeof j.bin === "object" ? j.bin : {};
      for (const [cmd, file] of Object.entries(bins)) if (typeof file === "string") entries.push({ file: join(file), why: `runs when you type the \`${cmd}\` command` });
      for (const name of ["start", "dev", "serve"])
        if (scripts[name]) for (const f of filesInCommand(scripts[name])) entries.push({ file: join(f), why: `\`npm run ${name}\` starts it (\`${scripts[name]}\`)` });
      return {
        path,
        kind: "npm",
        name: typeof j.name === "string" ? j.name : undefined,
        description: typeof j.description === "string" ? j.description : undefined,
        scripts,
        scriptsLine: lineOf(text, text.indexOf('"scripts"')),
        deps: [...Object.keys(j.dependencies ?? {}), ...Object.keys(j.devDependencies ?? {}), ...Object.keys(j.peerDependencies ?? {})].map((d) => d.toLowerCase()),
        entries,
      };
    }
    if (base === "composer.json") {
      const j = JSON.parse(text);
      return { path, kind: "php", name: j.name, description: j.description, scripts: {}, deps: Object.keys({ ...j.require, ...j["require-dev"] }).map((d) => d.toLowerCase()), entries: [] };
    }
  } catch {
    return undefined; // not valid JSON: treat it as an ordinary file
  }
  if (base === "pyproject.toml") {
    const s = tomlSections(text);
    const project = s.get("project");
    const poetry = s.get("tool.poetry");
    const scripts = Object.fromEntries([...tomlPairs(s.get("project.scripts")), ...tomlPairs(s.get("tool.poetry.scripts"))]);
    return {
      path,
      kind: "python",
      name: tomlString(project, "name") ?? tomlString(poetry, "name"),
      description: tomlString(project, "description") ?? tomlString(poetry, "description"),
      scripts,
      scriptsLine: lineOf(text, text.search(/^\[(project|tool\.poetry)\.scripts\]/m)),
      deps: [
        ...tomlArray(project, "dependencies"),
        ...tomlKeys(s.get("tool.poetry.dependencies")),
        ...tomlKeys(s.get("tool.poetry.group.dev.dependencies")),
        ...[...s.entries()].filter(([k]) => k.startsWith("project.optional-dependencies") || k === "dependency-groups").flatMap(([, v]) => [...v.matchAll(/["']([^"']+)["']/g)].map((x) => x[1])),
      ].map(depName).filter(Boolean),
      // "wordcount.cli:main" → the module wordcount/cli.py, resolved against the repo later.
      entries: Object.entries(scripts).map(([cmd, target]) => ({ file: `py:${target.split(":")[0]}`, why: `runs when you type the \`${cmd}\` command (\`pyproject.toml\`)` })),
    };
  }
  if (/^requirements.*\.txt$/i.test(base)) {
    const deps = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*[#-]/.test(l)).map(depName).filter(Boolean);
    return { path, kind: "python", scripts: {}, deps, entries: [] };
  }
  if (base === "setup.py") {
    const deps = [...(text.match(/install_requires\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "").matchAll(/["']([^"']+)["']/g)].map((m) => depName(m[1]));
    return { path, kind: "python", name: text.match(/\bname\s*=\s*["']([^"']+)/)?.[1], description: text.match(/\bdescription\s*=\s*["']([^"']+)/)?.[1], scripts: {}, deps, entries: [] };
  }
  if (base === "go.mod") {
    const deps = [...text.matchAll(/^\s*(?:require\s+)?([\w.\-]+\.[\w.\-/]+)\s+v[\d.]+/gm)].map((m) => m[1].toLowerCase());
    return { path, kind: "go", name: text.match(/^module\s+(\S+)/m)?.[1], scripts: {}, deps, entries: [] };
  }
  if (base === "Cargo.toml") {
    const s = tomlSections(text);
    return { path, kind: "cargo", name: tomlString(s.get("package"), "name"), description: tomlString(s.get("package"), "description"), scripts: {}, deps: [...tomlKeys(s.get("dependencies")), ...tomlKeys(s.get("dev-dependencies"))], entries: [] };
  }
  if (base === "pom.xml") {
    const top = text.replace(/<parent>[\s\S]*?<\/parent>/, "").replace(/<dependencies>[\s\S]*<\/dependencies>/, "").replace(/<build>[\s\S]*<\/build>/, "");
    const deps = [...text.matchAll(/<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>/g)].map((m) => `${m[1]}:${m[2]}`.toLowerCase());
    return { path, kind: "maven", name: top.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1], description: top.match(/<description>([^<]+)<\/description>/)?.[1], scripts: {}, deps, entries: [] };
  }
  if (base.startsWith("build.gradle")) {
    const deps = [...text.matchAll(/\b(?:implementation|api|compileOnly|runtimeOnly|testImplementation|kapt|ksp)\s*\(?\s*["']([^"':]+:[^"':]+)/g)].map((m) => m[1].toLowerCase());
    if (/id\s*\(?\s*["']org\.springframework\.boot/.test(text)) deps.push("org.springframework.boot:plugin");
    return { path, kind: "gradle", scripts: {}, deps, entries: [] };
  }
  if (base === "Gemfile") {
    return { path, kind: "ruby", scripts: {}, deps: [...text.matchAll(/^\s*gem\s+["']([^"']+)/gm)].map((m) => m[1].toLowerCase()), entries: [] };
  }
  return undefined;
}

// ------------------------------------------------------------------ frameworks

const FRAMEWORKS: { id: string; name: string; what: string; deps: string[] }[] = [
  { id: "next", name: "Next.js", what: "a React framework: pages are files in `app/` or `pages/`, and it can also run server code (API routes)", deps: ["next"] },
  { id: "react", name: "React", what: "a library for building user interfaces out of small pieces called components", deps: ["react"] },
  { id: "react-native", name: "React Native", what: "builds phone apps with React", deps: ["react-native"] },
  { id: "expo", name: "Expo", what: "tools that make React Native apps easier to build and run", deps: ["expo"] },
  { id: "vue", name: "Vue", what: "a library for building user interfaces from components", deps: ["vue"] },
  { id: "svelte", name: "Svelte", what: "a compiler for building user interfaces from components", deps: ["svelte", "@sveltejs/kit"] },
  { id: "angular", name: "Angular", what: "a full framework for web front ends, built from components and services", deps: ["@angular/core"] },
  { id: "vite", name: "Vite", what: "a fast development server and build tool for web front ends", deps: ["vite"] },
  { id: "express", name: "Express", what: "a minimal web server for Node.js: you connect web addresses (routes) to functions", deps: ["express"] },
  { id: "fastify", name: "Fastify", what: "a fast web server for Node.js", deps: ["fastify"] },
  { id: "nestjs", name: "NestJS", what: "a structured Node.js server framework built from modules, controllers and services", deps: ["@nestjs/core"] },
  { id: "koa", name: "Koa", what: "a small web server for Node.js", deps: ["koa"] },
  { id: "electron", name: "Electron", what: "builds desktop apps with web technology", deps: ["electron"] },
  { id: "vscode", name: "the VS Code extension API", what: "a plugin for the VS Code editor; VS Code loads it and calls its `activate` function", deps: ["@types/vscode"] },
  { id: "prisma", name: "Prisma", what: "a database toolkit: tables are described in `schema.prisma` and used from code", deps: ["prisma", "@prisma/client"] },
  { id: "mongoose", name: "Mongoose", what: "lets JavaScript code talk to a MongoDB database", deps: ["mongoose"] },
  { id: "pg", name: "node-postgres", what: "lets JavaScript code talk to a PostgreSQL database", deps: ["pg"] },
  { id: "tailwind", name: "Tailwind CSS", what: "styles written as small class names right in the HTML", deps: ["tailwindcss"] },
  { id: "jest", name: "Jest", what: "runs the JavaScript tests", deps: ["jest"] },
  { id: "vitest", name: "Vitest", what: "runs the JavaScript tests", deps: ["vitest"] },
  { id: "mocha", name: "Mocha", what: "runs the JavaScript tests", deps: ["mocha"] },
  { id: "flask", name: "Flask", what: "a small Python web framework: each web address is handled by a Python function", deps: ["flask"] },
  { id: "django", name: "Django", what: "a complete Python web framework with a database layer, admin pages and templates built in", deps: ["django"] },
  { id: "fastapi", name: "FastAPI", what: "a Python framework for building web APIs, which checks the data using type hints", deps: ["fastapi"] },
  { id: "streamlit", name: "Streamlit", what: "turns a Python script into a web page with charts and widgets", deps: ["streamlit"] },
  { id: "sqlalchemy", name: "SQLAlchemy", what: "lets Python code talk to a SQL database using classes", deps: ["sqlalchemy", "flask-sqlalchemy"] },
  { id: "pydantic", name: "Pydantic", what: "checks that data has the right shape and types", deps: ["pydantic"] },
  { id: "click", name: "Click", what: "builds command-line tools in Python", deps: ["click", "typer"] },
  { id: "pandas", name: "pandas", what: "works with tables of data in Python", deps: ["pandas"] },
  { id: "pytorch", name: "PyTorch", what: "builds and trains neural networks", deps: ["torch"] },
  { id: "pytest", name: "pytest", what: "runs the Python tests", deps: ["pytest"] },
  { id: "gin", name: "Gin", what: "a Go web framework", deps: ["github.com/gin-gonic/gin"] },
  { id: "echo", name: "Echo", what: "a Go web framework", deps: ["github.com/labstack/echo/v4"] },
  { id: "fiber", name: "Fiber", what: "a Go web framework", deps: ["github.com/gofiber/fiber/v2"] },
  { id: "spring", name: "Spring Boot", what: "a Java framework for web services: classes marked with annotations like `@RestController` handle requests", deps: ["org.springframework.boot:"] },
  { id: "axum", name: "Axum", what: "a Rust web framework", deps: ["axum"] },
  { id: "actix", name: "Actix Web", what: "a Rust web framework", deps: ["actix-web"] },
  { id: "rails", name: "Ruby on Rails", what: "a full Ruby web framework, organized as models, views and controllers", deps: ["rails"] },
  { id: "laravel", name: "Laravel", what: "a full PHP web framework", deps: ["laravel/framework"] },
];

export function detectFrameworks(manifests: Manifest[], paths: string[]): Framework[] {
  const found: Framework[] = [];
  const add = (f: (typeof FRAMEWORKS)[number], evidence: string) => {
    if (!found.some((x) => x.id === f.id)) found.push({ id: f.id, name: f.name, what: f.what, evidence });
  };
  for (const m of manifests)
    for (const f of FRAMEWORKS)
      for (const d of f.deps) {
        const dep = m.deps.find((x) => (d.endsWith(":") ? x.startsWith(d) : x === d));
        if (dep) add(f, `\`${dep}\` in \`${m.path}\``);
      }
  const byId = (id: string) => FRAMEWORKS.find((f) => f.id === id)!;
  if (paths.some((p) => basename(p) === "manage.py")) add(byId("django"), "`manage.py`");
  if (paths.some((p) => /(^|\/)next\.config\.[cm]?[jt]s$/.test(p))) add(byId("next"), "`next.config`");
  if (paths.some((p) => basename(p) === "schema.prisma")) add(byId("prisma"), "`schema.prisma`");
  return found;
}
