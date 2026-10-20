// Builds dev/preview.html: the real webview markup from src/mentorView.ts with
// a fake VS Code API, so the UI can be worked on in a normal browser.
// Usage: node dev/preview.mjs && open dev/preview.html
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../src/mentorView.ts", import.meta.url), "utf8");
const body = src.slice(src.indexOf("<body>") + 6, src.indexOf("</body>"));
const html = body
  .replace(/\$\{uri\("([^"]+)"\)\}/g, "../media/$1")
  .replace(/ nonce="\$\{nonce\}"/g, "")
  .replace(/\$\{icon\("([\w-]+)"\)\}/g, '<i class="codicon codicon-$1" aria-hidden="true"></i>');

const theme = `
:root {
  --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --vscode-font-size: 13px;
  --vscode-editor-font-family: Menlo, monospace; --vscode-editor-font-size: 12px;
  --vscode-foreground: #cccccc; --vscode-descriptionForeground: #9d9d9d;
  --vscode-sideBar-background: #181818; --vscode-editor-background: #1f1f1f;
  --vscode-button-background: #0078d4; --vscode-button-foreground: #fff; --vscode-button-hoverBackground: #026ec1;
  --vscode-button-secondaryBackground: #313131; --vscode-button-secondaryForeground: #ccc; --vscode-button-secondaryHoverBackground: #3c3c3c;
  --vscode-input-background: #313131; --vscode-input-foreground: #ccc; --vscode-input-border: #3c3c3c;
  --vscode-panel-border: #2b2b2b; --vscode-focusBorder: #0078d4; --vscode-textCodeBlock-background: #2b2b2b;
  --vscode-dropdown-background: #313131; --vscode-dropdown-foreground: #ccc; --vscode-editor-selectionBackground: #264f78;
}
body { width: 360px; height: 720px; border-right: 1px solid #333; }`;

const mock = `
<script>
const REPLY = "Nice start: your loop visits every element, and \`total\` starts at the right value.\\n\\nA few things to think about:\\n\\n- What does your function return when \`nums\` is empty?\\n- On line 4 you compare with \`>\`. What should happen when two values are **equal**?\\n\\nHere's the full fix:\\n\`\`\`python\\ndef best(nums):\\n    if not nums:\\n        return None\\n    m = nums[0]\\n    for n in nums:\\n        m = max(m, n)\\n    return m\\n\`\`\`\\n\\n> Try tracing \`[3, 3, 1]\` by hand before you change anything.\\n";
window.acquireVsCodeApi = () => {
  let state = {};
  const reply = (m) => window.postMessage(m, "*");
  return {
    getState: () => state, setState: (s) => (state = s),
    postMessage(m) {
      console.log("to extension", m);
      if (m.type === "ready") {
        reply({ type: "config", mascot: true, providerLabel: "Claude · claude-opus-5-5 (mock)", needsKey: false, maxCodeLines: 3 });
        reply({ type: "progress", streak: 3, data: { questions: 4, reviews: 3, hintsByLevel: [2, 1, 0], solutionRequestsRedirected: 1, codeHidden: 2, plansChecked: 2, quizzes: 1, predictionsRight: 7, predictionsTotal: 9, concepts: { "edge cases": 4, recursion: 2, "time complexity": 1 }, activeDays: [] } });
      }
      if (m.type === "ask") {
        reply({ type: "user", label: m.action === "chat" ? "" : m.action, text: m.text, fileName: "main.py" });
        if (/for me|give me the/i.test(m.text)) return reply({ type: "mentor", text: "I won't write it for you. What have you tried so far?", mood: "wag" });
        reply({ type: "start", id: 1 });
        // Mirrors the guard: the long code block arrives as a hidden notice.
        const guarded = REPLY.replace(/\\\`\\\`\\\`python[\\s\\S]*?\\\`\\\`\\\`\\n/, "> **Code hidden by the guardrail.** The mentor wrote 7 lines of code, more than the 3-line limit, so it isn't shown.\\n");
        const parts = guarded.match(/[\\s\\S]{1,24}/g);
        let i = 0;
        const t = setInterval(() => {
          if (i < parts.length) reply({ type: "delta", id: 1, text: parts[i++] });
          else { clearInterval(t); reply({ type: "done", id: 1, hidden: 1 }); }
        }, 60);
      }
    },
  };
};
setTimeout(() => window.postMessage({ type: "nudge", question: "This loop runs inside another loop. If the input doubles, how much longer will this take?", line: 11, fileName: "main.py" }, "*"), 2500);
</script>`;

writeFileSync(
  new URL("./preview.html", import.meta.url),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../media/codicons/codicon.css"><link rel="stylesheet" href="../media/main.css"><style>${theme}</style>${mock}</head><body>${html}</body></html>`,
);
console.log("Wrote dev/preview.html");
