// Builds dev/board-preview.html: the real board page from src/board.ts with a
// fake VS Code API, so the roadmap and lessons can be checked in a browser.
// Usage: npx tsx dev/board-preview.ts, serve the project folder, then open
// /dev/board-preview.html (roadmap) or /dev/board-preview.html?lesson=tuples
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadLessons } from "../src/lessons/index";
import { buildRoadmap, PROBLEM_MILESTONES, emptyRoadmapState, toggleItem, toggleLadder, markPassed, roadmapProgress, leetcodeUrl } from "../src/roadmap";
import { UNITS } from "../src/lessons/types";

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
window.acquireVsCodeApi = () => ({
  postMessage(m) {
    console.log("to extension", m);
    const reply = (x) => window.postMessage(x, "*");
    const want = new URLSearchParams(location.search).get("lesson");
    if (m.type === "ready") reply(want ? LESSONS[want] : ROADMAP);
    if (m.type === "openLesson") reply(LESSONS[m.id]);
    if (m.type === "backToRoadmap") reply(ROADMAP);
    if (m.type === "runExample") setTimeout(() => reply({ type: "runResult", exampleId: m.id, result: OUTPUTS[m.id] }), 250);
    if (m.type === "checkExercise") setTimeout(() => reply({ type: "checkResult", exerciseId: m.exerciseId, result: { passed: 3, failed: 2, lines: ["PASS no moves", "PASS straight line", "FAIL back and forth: got 3, want 2", "PASS a square", "FAIL long walk: got None, want 4"] } }), 400);
  },
});
</script>`;
const theme = readFileSync(path.join(__dirname, "preview.mjs"), "utf8").match(/const theme = `([\s\S]*?)`;/)![1].replace(/body \{[^}]*\}/, "");
writeFileSync(
  path.join(__dirname, "board-preview.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../media/codicons/codicon.css"><link rel="stylesheet" href="../media/board.css"><style>${theme} body{background:#1f1f1f}</style>${mock}</head><body data-sprites="../media/panda">${html}</body></html>`,
);
console.log("Wrote dev/board-preview.html");
