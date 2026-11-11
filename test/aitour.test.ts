// The AI repo tour: what gets sent, and how what comes back is checked.
// The model is a stub here; nothing calls a real API.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { walkRepo } from "../src/repo/walk";
import { buildIndex } from "../src/repo/index";
import { redactSecrets, REDACTED } from "../src/tour/ai/redact";
import { BUDGETS, estimateCost, fileExcerpt, indexDigest, planSend } from "../src/tour/ai/digest";
import { findAnchor, normalizeAiTour, normalizeOverview } from "../src/tour/ai/normalize";
import { SummaryCache, writeAiTour } from "../src/tour/ai/writer";
import { guardExplanation } from "../src/guardrails";
import { flatStops } from "../src/tour/tour";
import type { MentorProvider } from "../src/providers/types";
import type { AiTour } from "../src/tour/ai/schema";

const FIXTURES = path.join(__dirname, "fixtures/repos");

// Fake keys, built at run time so no key-shaped string is ever committed.
const FAKE = {
  aws: "AKIA" + "Q".repeat(16),
  anthropic: "sk-ant-" + "api03-" + "x".repeat(40),
  github: "ghp_" + "a1".repeat(18),
  stripe: "sk_" + "live_" + "Z".repeat(24),
  pem: "-----BEGIN RSA PRIVATE KEY-----\nMIIEow" + "A".repeat(60) + "\n-----END RSA PRIVATE KEY-----",
  assigned: "hunter2-is-not-" + "a-good-password",
};

/** The express fixture plus a config file full of fake secrets and a .env. */
async function plantedRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "mentor-ai-"));
  cpSync(path.join(FIXTURES, "express-api"), root, { recursive: true });
  writeFileSync(
    path.join(root, "src/config.js"),
    `// Settings for the notes API.\nconst AWS_KEY = "${FAKE.aws}";\nconst anthropic = "${FAKE.anthropic}";\nconst gh = '${FAKE.github}';\nconst stripe = "${FAKE.stripe}";\nconst db_password = "${FAKE.assigned}";\nconst pem = \`${FAKE.pem}\`;\nconst url = "postgres://admin:${FAKE.assigned}@db:5432/notes";\nmodule.exports = { AWS_KEY };\n`,
  );
  writeFileSync(path.join(root, ".env"), `DATABASE_URL=${FAKE.assigned}\n`);
  writeFileSync(path.join(root, "src/server.js"), `const app = require("./app");\nconst config = require("./config");\n\nconst port = process.env.PORT || 3000;\napp.listen(port, () => console.log(\`listening on \${port}\`));\n`);
  const w = await walkRepo(root);
  const index = buildIndex(w.files, { rootName: "notes" });
  return { root, index, texts: new Map(w.files.map((f) => [f.path, f.text])) };
}

test("key-shaped strings are blanked out, ordinary code isn't", () => {
  for (const [name, key] of Object.entries(FAKE)) {
    const src = name === "assigned" ? `password = "${key}"` : `x = "${key}"`;
    const out = redactSecrets(src);
    assert.ok(!out.text.includes(key.slice(8, 24)), `${name}: ${out.text}`);
    assert.ok(out.text.includes(REDACTED), name);
  }
  for (const ok of ['const token = req.headers["x-token"];', "password = os.environ['DB_PASSWORD']", 'API_KEY = "your-key-here"', "const skip = items.slice(1);"]) assert.equal(redactSecrets(ok).text, ok);
  assert.equal(redactSecrets("postgres://admin:secretpw@db/x").text, `postgres://${REDACTED}@db/x`);
});

test("no secret ever reaches a prompt", async () => {
  const { index, texts } = await plantedRepo();
  assert.equal(texts.get(".env"), undefined, ".env is never read");
  const prompts: string[] = [];
  const provider = stubProvider(index, texts, prompts);
  await writeAiTour({ index, texts, provider, model: "stub", level: "new", budget: "large", cache: new SummaryCache(), signal: new AbortController().signal });
  assert.ok(prompts.length >= 3);
  const sent = prompts.join("\n");
  assert.ok(sent.includes("src/config.js"), "the config file itself was sent (with its secrets blanked)");
  for (const [name, key] of Object.entries(FAKE)) assert.ok(!sent.includes(key.slice(6, 26)), `${name} leaked into a prompt`);
  assert.ok(!sent.includes(".env ==="), "no excerpt of .env");
});

test("what gets sent fits the budget, most important files first", async () => {
  const w = await walkRepo(path.join(__dirname, ".."));
  const index = buildIndex(w.files, { rootName: "senior-dev-mentor" });
  const texts = new Map(w.files.map((f) => [f.path, f.text]));
  for (const budget of ["small", "medium", "large"] as const) {
    const plan = planSend(index, texts, budget);
    assert.ok(plan.inputTokens <= BUDGETS[budget] * 1.1, `${budget}: ${plan.inputTokens}`);
    assert.equal(plan.files[0], "src/extension.ts", "the entry point comes first");
  }
  assert.ok(planSend(index, texts, "small").files.length < planSend(index, texts, "large").files.length);
  assert.ok(!planSend(index, texts, "large", (p) => p.startsWith("src/repo/")).files.some((p) => p.startsWith("src/repo/")), ".mentorignore paths are never sent");
  const digest = indexDigest(index);
  assert.equal(digest, indexDigest(index), "the digest is stable, so it caches");
  assert.ok(estimateCost("claude-opus-5-5", 1_000_000, 0) === 4);
  const ex = fileExcerpt(index.files.find((f) => f.path === "src/mentorView.ts")!, texts.get("src/mentorView.ts")!, 120);
  assert.match(ex, /excerpt/);
  assert.match(ex, /^\s+1\| /m, "lines are numbered from 1");
});

test("stops must quote real code: invented files and lines are dropped or moved", async () => {
  const { index, texts } = await plantedRepo();
  const raw: AiTour = {
    chapters: [
      {
        title: "Start",
        why: "",
        stops: [
          stop("src/server.js", 5, "app.listen(port"), // right
          stop("src/server.js", 1, "app.listen(port"), // wrong line: moved to 5
          stop("src/nope.js", 1, "anything"), // invented file
          stop("src/app.js", 3, "this code does not exist"), // invented code
          stop(".env", 1, "DATABASE_URL"), // a secret
          stop("src/db.js", 999, "async function query"), // out of range, anchor found
        ],
      },
      { title: "Empty", why: "", stops: [stop("nope.py", 1, "x")] },
    ],
  };
  const { tour, report } = normalizeAiTour(raw, index, texts, "new");
  const stops = flatStops(tour);
  assert.deepEqual(stops.map((s) => `${s.path}:${s.line + 1}`), ["src/server.js:5", "src/server.js:5", "src/db.js:6"]);
  assert.equal(report.moved, 2);
  assert.equal(report.dropped.length, 4);
  assert.equal(tour.chapters.length, 1, "a chapter with no valid stops is dropped");
  assert.equal(findAnchor(["a", "foo(", "  bar)"], "foo( bar)", 0), 1, "an anchor may span two lines");
});

test("the guardrail lets the repo's own code through, but not new code", async () => {
  const { texts } = await plantedRepo();
  const corpus = [...texts.values()].filter((t): t is string => !!t);
  const quoted = "Here is the handler:\n```js\nrouter.post(\"/\", async (req, res) => {\n  const error = validateNote(req.body);\n  if (error) return res.status(400).json({ error });\n  res.status(201).json(await db.query(\"INSERT INTO notes (text) VALUES ($1) RETURNING *\", [req.body.text]));\n});\n```\nRead it.";
  const out = guardExplanation(quoted, corpus);
  assert.match(out.text, /validateNote\(req\.body\)/, "a quote from the repo stays");
  assert.equal(out.stats.hiddenBlocks, 0);
  const invented = "Fix it like this:\n```js\nfunction fixed(a) {\n  const b = a.map((x) => x * 2);\n  const c = b.filter(Boolean);\n  return c.reduce((s, x) => s + x, 0);\n}\n```";
  const hid = guardExplanation(invented, corpus);
  assert.match(hid.text, /Code hidden by the guardrail/);
  assert.doesNotMatch(hid.text, /reduce/);
});

test("the overview keeps only boxes and arrows that make sense", async () => {
  const { index, texts } = await plantedRepo();
  const o = normalizeOverview(
    {
      purpose: "A notes API.",
      users: "Apps call it.",
      howItWorks: "server.js starts app.js.",
      architecture: {
        boxes: [
          { id: "api", label: "Express API", what: "Handles requests.", files: ["src/app.js", "src/routes/notes.js", "src/invented.js", ".env"] },
          { id: "db", label: "PostgreSQL", what: "Stores notes.", files: [] },
          { id: "api", label: "Duplicate", what: "", files: [] },
        ],
        arrows: [
          { from: "api", to: "db", label: "SQL query" },
          { from: "api", to: "ghost", label: "?" },
          { from: "db", to: "db", label: "self" },
        ],
      },
      glossary: [{ term: "route", meaning: "A web address the server answers." }, { term: "", meaning: "x" }],
    },
    index,
    texts,
  );
  assert.deepEqual(o.architecture.boxes.map((b) => b.id), ["api", "db"]);
  assert.deepEqual(o.architecture.boxes[0].files, ["src/app.js", "src/routes/notes.js"], "invented files and secrets dropped");
  assert.equal(o.architecture.arrows.length, 1);
  assert.equal(o.glossary.length, 1);
});

test("the whole pipeline, with summaries cached for next time", async () => {
  const { index, texts, root } = await plantedRepo();
  const prompts: string[] = [];
  const cacheFile = path.join(root, ".cache-test/summaries.json");
  const r1 = await writeAiTour({ index, texts, provider: stubProvider(index, texts, prompts), model: "stub", level: "new", budget: "medium", cache: new SummaryCache(cacheFile), signal: new AbortController().signal });
  assert.ok(r1.tour.ai, "marked as AI-written");
  assert.ok(flatStops(r1.tour).length >= 2);
  assert.equal(r1.tour.ai!.overview.architecture.boxes.length, 2);
  assert.ok(r1.tour.quiz.length >= 1, "check questions become the quiz");
  assert.ok(r1.calls >= 3);
  const before = prompts.length;
  const r2 = await writeAiTour({ index, texts, provider: stubProvider(index, texts, prompts), model: "stub", level: "new", budget: "medium", cache: new SummaryCache(cacheFile), signal: new AbortController().signal });
  assert.equal(r2.cachedFiles, r2.sentFiles.length, "every summary came from the cache");
  assert.equal(prompts.length - before, 2, "only the overview and the tour were asked again");
});

// ------------------------------------------------------------------ helpers

function stop(p: string, line: number, anchor: string): AiTour["chapters"][number]["stops"][number] {
  return { path: p, line, anchor, bubble: "Look here.", explain: "This line matters.", simpler: "Simply put.", deeper: "In depth.", checkQuestion: "What happens here?", checkAnswer: "It runs." };
}

/** Answers like a model would, using the real files, and records every prompt it was sent. */
function stubProvider(index: ReturnType<typeof buildIndex>, texts: Map<string, string | undefined>, prompts: string[]): MentorProvider {
  return {
    label: "Stub",
    async *stream() {},
    async json(system: string, user: string) {
      prompts.push(system + "\n" + user);
      if (/For each excerpt/.test(system)) {
        const files = [...user.matchAll(/^=== (\S+) /gm)].map((m) => m[1]);
        return { files: files.map((p) => ({ path: p, purpose: `Purpose of ${p}.`, parts: [{ name: "top", line: 1, what: "The start." }], notable: [] })) };
      }
      if (/architecture: 3 to 7 boxes/.test(system))
        return {
          purpose: "A notes API.",
          users: "Apps.",
          howItWorks: "Requests go to app.js.",
          architecture: { boxes: [{ id: "api", label: "API", what: "Requests.", files: ["src/app.js"] }, { id: "db", label: "Database", what: "Data.", files: ["src/db.js"] }], arrows: [{ from: "api", to: "db", label: "SQL" }] },
          glossary: [{ term: "route", meaning: "An address." }],
        };
      const first = (p: string) => (texts.get(p) ?? "").split("\n")[0];
      return { chapters: [{ title: "Start", why: "Begin here.", stops: [stop("src/server.js", 1, first("src/server.js").slice(0, 20)), stop("src/app.js", 2, "const express = require")] }] };
    },
  };
}
