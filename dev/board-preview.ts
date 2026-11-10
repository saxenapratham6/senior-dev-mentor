// Builds dev/board-preview.html: the real board page from src/board.ts with a
// fake VS Code API that shows the roadmap, so it can be checked in a browser.
// Usage: npx tsx dev/board-preview.ts, then serve the project folder and open /dev/board-preview.html
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROADMAP, PROBLEM_MILESTONES, emptyRoadmapState, toggleItem, addSolved, roadmapProgress } from "../src/roadmap";

const src = readFileSync(path.join(__dirname, "../src/board.ts"), "utf8");
const body = src.slice(src.indexOf("<main"), src.indexOf("</body>"));
const html = body
  .replace(/\$\{uri\("panda"\)\}/g, "../media/panda")
  .replace(/\$\{uri\("([^"]+)"\)\}/g, "../media/$1")
  .replace(/ nonce="\$\{nonce\}"/g, "")
  .replace(/\$\{icon\("([\w-]+)"\)\}/g, '<i class="codicon codicon-$1" aria-hidden="true"></i>');

let state = emptyRoadmapState(0);
for (const id of ["p1-learn", "p1-guide-a"]) state = toggleItem(state, id);
state = addSolved(addSolved(state, "easy", 1), "medium", 1);
const data = { type: "roadmap", phases: ROADMAP, state, progress: roadmapProgress(state), milestones: PROBLEM_MILESTONES };

const mock = `<script>
window.acquireVsCodeApi = () => ({
  postMessage(m) {
    console.log("to extension", m);
    if (m.type === "ready") window.postMessage(${JSON.stringify(data)}, "*");
  },
});
</script>`;
const theme = readFileSync(path.join(__dirname, "preview.mjs"), "utf8").match(/const theme = `([\s\S]*?)`;/)![1].replace(/body \{[^}]*\}/, "");
writeFileSync(
  path.join(__dirname, "board-preview.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../media/codicons/codicon.css"><link rel="stylesheet" href="../media/board.css"><style>${theme} body{background:#1f1f1f}</style>${mock}</head><body data-sprites="../media/panda">${html}</body></html>`,
);
console.log("Wrote dev/board-preview.html");
