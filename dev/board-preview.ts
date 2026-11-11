// Builds dev/board-preview.html: the real board page from src/board.ts with a
// fake VS Code API, so the roadmap and lessons can be checked in a browser.
// Usage: npx tsx dev/board-preview.ts, serve the project folder, then open
// /dev/board-preview.html (roadmap) or /dev/board-preview.html?lesson=tuples
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadLessons } from "../src/lessons/index";
import { buildRoadmap, PROBLEM_MILESTONES, emptyRoadmapState, toggleItem, toggleLadder, markPassed, roadmapProgress, leetcodeUrl } from "../src/roadmap";
import { UNITS } from "../src/lessons/types";
import { walkRepo } from "../src/repo/walk";
import { buildIndex } from "../src/repo/index";
import { buildRepoTour, flatStops } from "../src/tour/tour";
import { repoView, tourView } from "../src/tour/view";
import { normalizeAiTour, normalizeOverview } from "../src/tour/ai/normalize";
import { planSend, estimateCost } from "../src/tour/ai/digest";
import { traceStarts, buildTrace, traceTour } from "../src/tour/trace";
import { deployReport } from "../src/deploy/report";

const root = path.join(__dirname, "..");
const src = readFileSync(path.join(root, "src/board.ts"), "utf8");
const body = src.slice(src.indexOf("<main"), src.indexOf("</body>"));
const html = body
  .replace(/\$\{uri\("panda"\)\}/g, "../media/panda")
  .replace(/\$\{uri\("([^"]+)"\)\}/g, "../media/$1")
  .replace(/ nonce="\$\{nonce\}"/g, "")
  .replace(/\$\{icon\("([\w-]+)"\)\}/g, '<i class="codicon codicon-$1" aria-hidden="true"></i>');

const lessons = loadLessons(path.join(root, "lessons"));
const phases = buildRoadmap(lessons);
const outputs = JSON.parse(readFileSync(path.join(root, "media/lesson-outputs.json"), "utf8"));
let state = emptyRoadmapState(0);
for (const id of ["lesson:names-and-objects", "lesson:strings", "lesson:lists"]) state = toggleItem(state, id, phases);
state = markPassed(markPassed(state, "same-or-copy"), "count-visits");
state = toggleLadder(toggleLadder(state, lessons, "two-pointers", "Valid Palindrome"), lessons, "two-pointers", "3Sum");

const roadmapMsg = { type: "roadmap", phases, state, progress: roadmapProgress(state, phases), milestones: PROBLEM_MILESTONES };
const lessonMsgs = Object.fromEntries(
  lessons.map((l, i) => [
    l.id,
    {
      type: "lesson",
      lesson: l,
      unitTitle: `Unit ${l.unit} · ${UNITS[l.unit].title}`,
      saved: {},
      nav: { prev: lessons[i - 1] && { id: lessons[i - 1].id, title: lessons[i - 1].title }, next: lessons[i + 1] && { id: lessons[i + 1].id, title: lessons[i + 1].title } },
      done: state.done.includes(`lesson:${l.id}`),
      passed: state.passed,
      ladder: state.ladder,
      ladderUrls: Object.fromEntries((l.ladder ?? []).map((p) => [p.name, leetcodeUrl(p.name)])),
    },
  ]),
);

const mock = `<script>
const ROADMAP = ${JSON.stringify(roadmapMsg)};
const LESSONS = ${JSON.stringify(lessonMsgs)};
const OUTPUTS = ${JSON.stringify(outputs)};
const REPO = __REPO__;
const AI_REPO = __AIREPO__;
const TRACE = __TRACE__;
const DEPLOY = __DEPLOY__;
window.acquireVsCodeApi = () => ({
  postMessage(m) {
    console.log("to extension", m);
    const reply = (x) => window.postMessage(x, "*");
    const params = new URLSearchParams(location.search);
    const want = params.get("lesson");
    if (m.type === "ready" && params.has("trace")) return reply({ ...TRACE, at: Number(params.get("at") ?? -1) });
    if (m.type === "ready" && params.has("deploy")) return reply(DEPLOY);
    if (m.type === "deployTarget") reply({ ...DEPLOY, report: { ...DEPLOY.report, chosen: m.id } });
    if (m.type === "ready") reply(params.has("ai") ? { ...AI_REPO, at: Number(params.get("at") ?? -1) } : params.has("repo") ? { ...REPO, at: Number(params.get("at") ?? -1) } : want ? LESSONS[want] : ROADMAP);
    if (m.type === "aiTour") { reply({ ...REPO, ai: { ...REPO.ai, state: "working", text: "Reading 4 files… (0/4 read)" } }); setTimeout(() => reply({ type: "aiProgress", text: "Drawing the big picture…" }), 900); }
    if (m.type === "tourStart") reply({ type: "tourAt", stop: 0 });
    if (m.type === "tourJump") reply({ type: "tourAt", stop: m.stop });
    if (m.type === "tourEnd") reply({ type: "tourAt", stop: -1 });
    if (m.type === "openLesson") reply(LESSONS[m.id]);
    if (m.type === "backToRoadmap") reply(ROADMAP);
    if (m.type === "runExample") setTimeout(() => reply({ type: "runResult", exampleId: m.id, result: OUTPUTS[m.id] }), 250);
    if (m.type === "checkExercise") setTimeout(() => reply({ type: "checkResult", exerciseId: m.exerciseId, result: { passed: 3, failed: 2, lines: ["PASS no moves", "PASS straight line", "FAIL back and forth: got 3, want 2", "PASS a square", "FAIL long walk: got None, want 4"] } }), 400);
  },
});
</script>`;
const theme = readFileSync(path.join(__dirname, "preview.mjs"), "utf8").match(/const theme = `([\s\S]*?)`;/)![1].replace(/body \{[^}]*\}/, "");
(async () => {
  // The repo map shows the fixture named by REPO_FIXTURE (default flask-todo), or a folder path.
  const target = process.env.REPO_FIXTURE ?? "flask-todo";
  const dir = target.includes("/") ? path.resolve(target) : path.join(root, "test/fixtures/repos", target);
  const index = buildIndex((await walkRepo(dir)).files, { rootName: path.basename(dir) });
  const tour = buildRepoTour(index, "new");
  const walked = await walkRepo(dir);
  const texts = new Map(walked.files.map((f) => [f.path, f.text]));
  const plan = planSend(index, texts, "medium");
  const ai = { kind: "anthropic", label: "Claude (claude-opus-5-5)", ready: true, files: plan.files, tokens: plan.inputTokens, cost: estimateCost("claude-opus-5-5", plan.inputTokens, plan.outputTokens), budget: "medium", state: "idle", written: false };
  const repoMsg = { type: "repo", repo: repoView(index), tour: tourView(tour), level: "new", at: -1, resumeAt: flatStops(tour).length > 3 ? 2 : undefined, ai };
  // A sample AI tour of flask-todo, put through the same checks as a real one.
  const s = (path: string, line: number, anchor: string, bubble: string, explain: string, simpler: string, deeper: string, q = "", a = "") => ({ path, line, anchor, bubble, explain, simpler, deeper, checkQuestion: q, checkAnswer: a });
  const { tour: aiTour, report } = normalizeAiTour(
    {
      chapters: [
        { title: "The big picture", why: "What this app is.", stops: [s("README.md", 3, "A tiny todo list", "A todo list that runs in your browser.", "This is a small **Flask** web app: you see your todos in the browser, add new ones, and tick them off. The list is saved in a SQLite database file, so it survives a restart.", "It's a to-do list website. The computer remembers your list in a file.", "Classic server-rendered app: no JavaScript front end, every action is a form POST followed by a redirect (the POST/redirect/GET pattern).")] },
        { title: "Where it starts", why: "Everything begins with the app object.", stops: [s("app.py", 7, "app = Flask(__name__)", "The whole app hangs off this one object.", "`app = Flask(__name__)` creates the web app. Every web address below is attached to it with `@app.route`, and `init_db(app)` connects the database right after.", "This line builds the website. Everything else adds pages to it.", "`__name__` tells Flask where to find `templates/` and `static/`. A larger app would use an app factory (`create_app()`) so tests can build fresh instances.", "Which file would you open to see how the database is connected?", "`db.py`, because `init_db` is imported from there.")] },
        { title: "Adding a todo, end to end", why: "Follow one form submission through the code.", stops: [s("app.py", 16, '@app.route("/add", methods=["POST"])', "Submitting the form lands here.", "When you submit the form, the browser sends a **POST** to `/add`. This function reads the title from the form, saves a new `Todo`, and sends you back to `/`.", "Pressing Add sends your text here, and this code saves it.", "No validation: an empty title would be saved. `request.form[\"title\"]` raises a 400 if the field is missing entirely.", "What happens if the form is sent with an empty title?", "It's saved as an empty todo: nothing here checks it."), s("models.py", 4, "class Todo(db.Model):", "Each todo is one row in a table.", "`Todo` describes one row of the database table: an id, a title, and whether it's done. SQLAlchemy turns this class into the table for you.", "This is the shape of one to-do item.", "`nullable=False` on `title` is the only rule the database enforces; `done` defaults to False at the ORM level.")] },
        { title: "How it's run and tested", why: "", stops: [s("tests/test_app.py", 4, "def test_index_loads", "One test checks the home page loads.", "This test starts the app without a browser (`app.test_client()`) and checks that `/` answers with status 200.", "A robot opens the home page and checks it works.", "It uses the real SQLite file, so tests share state with development. A fixture with an in-memory database would isolate them.")] },
      ],
    },
    index,
    texts,
    "new",
  );
  aiTour.ai = {
    label: "Claude (claude-opus-5-5)",
    files: 4,
    checked: { kept: report.kept, moved: report.moved, dropped: report.dropped.length },
    overview: normalizeOverview(
      {
        purpose: "A tiny todo list you use in the browser: see your todos, add one, and mark it done.",
        users: "One person, in a web browser, on their own computer.",
        howItWorks: "The browser asks `app.py` for `/`, which loads every `Todo` from the database and fills in `templates/index.html`. Adding a todo sends a form to `/add`; the app saves a new row through `models.py` and `db.py`, then redirects back to `/`.",
        architecture: {
          boxes: [
            { id: "browser", label: "Browser", what: "Shows the page and sends forms.", files: [] },
            { id: "app", label: "Flask app", what: "Answers each web address.", files: ["app.py", "templates/index.html"] },
            { id: "model", label: "Todo model", what: "The shape of a todo.", files: ["models.py", "db.py"] },
            { id: "sqlite", label: "SQLite file", what: "Where todos are saved.", files: [] },
          ],
          arrows: [
            { from: "browser", to: "app", label: "HTTP request" },
            { from: "app", to: "model", label: "save / query" },
            { from: "model", to: "sqlite", label: "SQL" },
          ],
        },
        glossary: [
          { term: "route", meaning: "A web address the app answers, like `/add`." },
          { term: "model", meaning: "A class that describes one kind of row in the database." },
          { term: "redirect", meaning: "An answer that tells the browser to go to another address." },
        ],
      },
      index,
      texts,
    ),
  };
  aiTour.quiz = flatStops(aiTour).filter((x) => x.check).map((x) => ({ q: x.check!.question, a: x.check!.answer }));
  const starts = traceStarts(index, "someone adds a todo", texts);
  const tr = buildTrace(index, texts, starts[0], "someone adds a todo");
  const traceMsg = { ...repoMsg, goal: "trace", question: "someone adds a todo", suggestions: traceStarts(index, "", texts).map((x) => x.label), tour: tourView(traceTour("someone adds a todo", tr.steps, tr.sequence, "new")), resumeAt: undefined };
  const deployMsg = { type: "deploy", report: deployReport(index, texts).report, level: "new", ai: { kind: "anthropic", label: "Claude (claude-opus-5-5)", ready: true, state: "idle" } };
  const aiRepoMsg = { ...repoMsg, tour: tourView(aiTour), ai: { ...ai, written: true }, resumeAt: undefined };
  writeFileSync(
  path.join(__dirname, "board-preview.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../media/codicons/codicon.css"><link rel="stylesheet" href="../media/board.css"><style>${theme} body{background:#1f1f1f}</style>${mock.replace("__REPO__", JSON.stringify(repoMsg).replace(/</g, "\\u003c")).replace("__AIREPO__", JSON.stringify(aiRepoMsg).replace(/</g, "\\u003c")).replace("__TRACE__", JSON.stringify(traceMsg).replace(/</g, "\\u003c")).replace("__DEPLOY__", JSON.stringify(deployMsg).replace(/</g, "\\u003c"))}</head><body data-sprites="../media/panda">${html}</body></html>`,
);
  console.log("Wrote dev/board-preview.html");
})();
