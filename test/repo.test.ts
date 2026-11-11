// The repo index and the no-AI tour, checked against small fixture repos.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { walkRepo } from "../src/repo/walk";
import { buildIndex, firstParagraph } from "../src/repo/index";
import { classify, gitignore, isSecretPath } from "../src/repo/files";
import { parseManifest } from "../src/repo/manifests";
import { findEntry, findRoutes, findSymbols, leadingComment, rawImports } from "../src/repo/code";
import { buildFileTour, buildFolderTour, buildRepoTour, flatStops, LIMITS } from "../src/tour/tour";
import type { RepoIndex } from "../src/repo/types";

const FIXTURES = path.join(__dirname, "fixtures/repos");
const cache = new Map<string, Promise<{ index: RepoIndex; texts: Map<string, string | undefined> }>>();
function load(name: string) {
  if (!cache.has(name))
    cache.set(
      name,
      walkRepo(path.join(FIXTURES, name)).then((w) => ({ index: buildIndex(w.files, { rootName: name }), texts: new Map(w.files.map((f) => [f.path, f.text])) })),
    );
  return cache.get(name)!;
}
/** Paths in a bucket, most important first. */
const bucket = (index: RepoIndex, b: string) => index.files.filter((f) => f.bucket === b).sort((x, y) => y.score - x.score).map((f) => f.path);
const file = (index: RepoIndex, p: string) => index.files.find((f) => f.path === p)!;

test("each fixture's real entry point is the first file to read", async () => {
  const expected: Record<string, string> = {
    "flask-todo": "app.py",
    "express-api": "src/server.js",
    "vite-react-spa": "src/main.tsx",
    "go-http": "cmd/server/main.go",
    "python-cli": "src/wordcount/cli.py",
  };
  for (const [name, entry] of Object.entries(expected)) {
    const { index } = await load(name);
    assert.equal(bucket(index, "start")[0], entry, name);
  }
});

test("the files the code depends on become the core", async () => {
  const expected: Record<string, string[]> = {
    "flask-todo": ["db.py", "models.py"],
    "express-api": ["src/app.js", "src/routes/notes.js", "src/db.js", "src/utils/validate.js"],
    "vite-react-spa": ["src/App.tsx", "src/hooks/useTodos.ts"],
    "go-http": ["internal/store/store.go"],
    "python-cli": ["src/wordcount/counter.py"],
  };
  for (const [name, core] of Object.entries(expected)) {
    const { index } = await load(name);
    for (const p of core) assert.ok(bucket(index, "core").includes(p), `${name}: ${p} in core (got ${bucket(index, "core")})`);
    for (const t of index.files.filter((f) => f.kind === "test")) assert.notEqual(t.bucket, "core", `${name}: tests aren't core`);
  }
});

test("imports resolve across languages", async () => {
  const flask = (await load("flask-todo")).index;
  assert.deepEqual(file(flask, "app.py").imports.sort(), ["db.py", "models.py"]);
  assert.deepEqual(file(flask, "tests/test_app.py").imports, ["app.py"]);
  const express = (await load("express-api")).index;
  assert.deepEqual(file(express, "src/routes/notes.js").imports.sort(), ["src/db.js", "src/utils/validate.js"]);
  const vite = (await load("vite-react-spa")).index;
  assert.deepEqual(file(vite, "index.html").imports, ["src/main.tsx"], "a script tag in index.html counts");
  assert.deepEqual(file(vite, "src/App.tsx").imports.sort(), ["src/components/TodoList.tsx", "src/hooks/useTodos.ts"]);
  const go = (await load("go-http")).index;
  assert.deepEqual(file(go, "cmd/server/main.go").imports, ["internal/store/store.go"], "module path from go.mod");
  const cli = (await load("python-cli")).index;
  assert.deepEqual(file(cli, "src/wordcount/cli.py").imports, ["src/wordcount/counter.py"], "absolute imports from src/");
});

test("routes, entry reasons, frameworks and descriptions are found", async () => {
  const flask = (await load("flask-todo")).index;
  assert.deepEqual(file(flask, "app.py").routes.map((r) => `${r.method} ${r.path}`), ["GET /", "POST /add", "POST /done/<int:todo_id>"]);
  assert.deepEqual(flask.frameworks.map((f) => f.id), ["flask", "sqlalchemy", "pytest"]);
  assert.equal(flask.description, "A tiny todo list you run in the browser. Start with `app.py`.");
  assert.equal(file(flask, "db.py").doc, "Connects the app to its SQLite database.");
  const express = (await load("express-api")).index;
  assert.deepEqual(file(express, "src/routes/notes.js").routes.map((r) => `${r.method} ${r.path}`), ["GET /", "POST /"]);
  assert.match(file(express, "src/server.js").entry!.why, /web server/);
  assert.equal(express.name, "notes-api");
  const cli = (await load("python-cli")).index;
  assert.match(file(cli, "src/wordcount/cli.py").entry!.why, /`wordcount` command/);
  assert.deepEqual(cli.manifests[0].deps, ["click", "rich"], "extras like rich[jupyter] don't break the list");
  const go = (await load("go-http")).index;
  assert.deepEqual(file(go, "cmd/server/main.go").routes.map((r) => r.path), ["/shorten"]);
});

test("secrets are never read, and skipped files say why", async () => {
  const { index, texts } = await load("flask-todo");
  const env = file(index, ".env");
  assert.equal(env.kind, "secret");
  assert.equal(env.read, false);
  assert.equal(texts.get(".env"), undefined, "the walker never reads it");
  assert.equal(env.bucket, "skip");
  assert.match(env.skipWhy!, /passwords or keys/);
  assert.match(file(index, "migrations/versions/001_init.py").skipWhy!, /database changes/);
  const express = (await load("express-api")).index;
  assert.match(file(express, "package-lock.json").skipWhy!, /lockfile/);
  for (const p of [".env", ".env.local", "config/.env.production", "id_rsa", "server.pem", "credentials.json", ".npmrc"]) assert.ok(isSecretPath(p), p);
  for (const p of [".env.example", ".env.sample", "environment.ts", "keys.py"]) assert.ok(!isSecretPath(p), p);
});

test("ignored folders and .gitignore are respected", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "mentor-walk-"));
  const put = (p: string, text = "x = 1\n") => {
    mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    writeFileSync(path.join(root, p), text);
  };
  put("app.py");
  put("node_modules/lib/index.js");
  put("dist/bundle.js");
  put(".venv/lib/site.py");
  put("generated/out.py");
  put("logs/today.log");
  put("keep.log");
  put(".gitignore", "generated/\n*.log\n!keep.log\n");
  const { files } = await walkRepo(root);
  assert.deepEqual(files.map((f) => f.path).sort(), [".gitignore", "app.py", "keep.log"]);
  const ig = gitignore("/build\n**/tmp/**\n*.pyc\n");
  assert.equal(ig("build", true), true);
  assert.equal(ig("src/build", true), false, "a leading slash anchors to the root");
  assert.equal(ig("a/tmp/b.txt", false), true);
  assert.equal(ig("x/y.pyc", false), true);
});

test("classification and small parsers", () => {
  assert.equal(classify("src/app.test.ts").kind, "test");
  assert.equal(classify("tests/test_app.py").kind, "test");
  assert.equal(classify("pkg/store_test.go").kind, "test");
  assert.equal(classify("README.md").kind, "doc");
  assert.equal(classify("vite.config.ts").kind, "config");
  assert.equal(classify("vendor/lib/x.go").kind, "vendored");
  assert.equal(classify("app.min.js").kind, "generated");
  assert.equal(classify("api_pb2.py").kind, "generated");
  assert.equal(classify("x.py", "# @generated by protoc\n").kind, "generated");
  assert.equal(classify("logo.png").kind, "asset");
  assert.equal(classify("src/main.rs").kind, "source");

  assert.deepEqual(rawImports("TypeScript", 'import a from "./a";\nimport type { B } from "./b";\nimport {\n  c,\n  d,\n} from "./cd";\nexport * from "./e";\nconst f = require("./f");\nawait import("./g");'), ["./a", "./b", "./cd", "./e", "./f", "./g"]);
  assert.deepEqual(rawImports("Python", "from . import views\nfrom .models import (\n    Todo,\n    User,\n)\nimport os, json as j\n"), [".views", ".models.Todo", ".models.User", ".models", "os", "json"]);
  assert.deepEqual(findSymbols("Python", "import x\n\ndef a():\n    def inner(): pass\n\nclass B:\n    def m(self): pass\n").map((s) => s.name), ["a", "B"]);
  assert.deepEqual(findSymbols("TypeScript", "export function a() {}\nexport const b = (x: number) => x;\nexport interface C {}\nconst d = 3;\n").map((s) => s.name), ["a", "b", "C"]);
  assert.equal(findEntry("main.py", "Python", "def f(): pass\n\nif __name__ == '__main__':\n    f()\n")?.line, 2);
  assert.equal(findEntry("src/extension.ts", "TypeScript", "import x from 'y';\nexport async function activate(ctx) {}\n")?.line, 1);
  assert.deepEqual(findRoutes("app/api/users/route.ts", "TypeScript", "export async function GET() {}\nexport async function POST() {}\n").map((r) => `${r.method} ${r.path}`), ["GET /api/users", "POST /api/users"]);
  assert.deepEqual(findRoutes("src/main/java/Hello.java", "Java", '@GetMapping("/hello")\npublic String hi() {}').map((r) => r.path), ["/hello"]);
  assert.equal(leadingComment("Python", '#!/usr/bin/env python\n"""Downloads the data.\n\nMore here."""\n'), "Downloads the data.");
  assert.equal(leadingComment("TypeScript", "import a from 'a';\n\n// Where things go. Pure functions.\nexport const x = 1;"), "Where things go. Pure functions.");
  assert.equal(leadingComment("JavaScript", "/*\n * Copyright 2024 Someone. MIT License.\n */\nconst a = 1;"), undefined, "license headers aren't descriptions");
  assert.equal(parseManifest("package.json", "{ not json")?.name, undefined);
  assert.deepEqual(parseManifest("web/package.json", '{"bin": {"tool": "./cli.js"}, "scripts": {"dev": "nodemon --watch src server.ts"}}')!.entries.map((e) => e.file), ["web/cli.js", "web/server.ts"]);
  assert.equal(firstParagraph("# Title\n\n[![badge](x)](y)\n\nDoes **one** thing [well](z).\n"), "Does one thing well.");
});

test("the tour points only at real files and real lines", async () => {
  for (const name of ["flask-todo", "express-api", "vite-react-spa", "go-http", "python-cli"]) {
    const { index, texts } = await load(name);
    for (const level of ["new", "experienced"] as const) {
      const tour = buildRepoTour(index, level);
      const stops = flatStops(tour);
      assert.ok(stops.length >= 3, `${name}/${level}: has a tour`);
      assert.ok(stops.length <= LIMITS[level].stops, `${name}/${level}: short enough`);
      for (const s of stops) {
        const text = texts.get(s.path);
        assert.ok(text !== undefined, `${name}: ${s.path} exists and was read`);
        assert.ok(s.line >= 0 && s.line < text!.split("\n").length, `${name}: ${s.path}:${s.line} in range`);
        assert.ok(s.bubble.length <= 120, `${name}: bubble short: ${s.bubble}`);
        assert.ok(!stops.some((o) => o !== s && o.id === s.id), "ids are unique");
      }
      const firstStart = index.files.find((f) => f.bucket === "start");
      if (firstStart) assert.ok(stops.some((s) => s.path === firstStart.path), `${name}: visits the entry point`);
      assert.ok(!stops.some((s) => s.path === ".env"), "never stops at a secret");
    }
  }
});

test("beginners get terms explained once; experienced readers get it short", async () => {
  const { index } = await load("flask-todo");
  const beginner = flatStops(buildRepoTour(index, "new")).map((s) => s.note).join("\n");
  const expert = flatStops(buildRepoTour(index, "experienced")).map((s) => s.note).join("\n");
  assert.equal(beginner.match(/\*entry point\*/g)?.length, 1);
  assert.equal(beginner.match(/\*route\*/g)?.length, 1);
  assert.match(beginner, /\*\*Flask\*\* \(a small Python web framework/);
  assert.doesNotMatch(expert, /\*entry point\*|\*route\*|Try this/);
  assert.ok(expert.length < beginner.length / 2);
});

test("the quiz's answers come from the code", async () => {
  const { index } = await load("flask-todo");
  const quiz = buildRepoTour(index, "new").quiz;
  assert.equal(quiz[0].q, "Where does the program start?");
  assert.match(quiz[0].a, /`app\.py`/);
  assert.match(quiz.find((q) => q.q.startsWith("Where is"))!.a, /`db\.py`.*used by `app\.py`/);
  assert.match(quiz.find((q) => q.q.includes("POST /add"))!.a, /`app\.py`, line 16/);
  assert.match(quiz.find((q) => q.q.includes("run the tests"))!.a, /pytest/);
});

test("file and folder tours", async () => {
  const { index } = await load("express-api");
  const f = buildFileTour(index, "src/routes/notes.js", "new");
  const stops = flatStops(f);
  assert.ok(stops.some((s) => s.title === "POST /"), "visits each route");
  assert.deepEqual(stops.map((s) => s.line), [...stops.map((s) => s.line)].sort((a, b) => a - b), "top to bottom");
  const d = buildFolderTour(index, "src", "experienced");
  assert.equal(flatStops(d)[0].path, "src/server.js", "most important first");
  const flask = (await load("flask-todo")).index;
  const secret = buildFileTour(flask, ".env", "new");
  assert.equal(flatStops(secret).length, 0);
  assert.match(secret.message!, /won't open/);
  assert.match(buildFolderTour(flask, "migrations", "new").message!, /Nothing in migrations/);
});

test("this repo: the extension's own entry point comes first", async () => {
  const w = await walkRepo(path.join(__dirname, ".."));
  const index = buildIndex(w.files, { rootName: "senior-dev-mentor" });
  assert.equal(index.files.find((f) => f.bucket === "start")?.path, "src/extension.ts");
  assert.ok(index.files.filter((f) => f.bucket === "core").some((f) => f.path === "src/mentorView.ts"));
  assert.ok(!w.files.some((f) => f.path.startsWith("node_modules/")));
});
