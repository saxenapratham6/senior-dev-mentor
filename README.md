# Senior Dev Mentor

An open-source VS Code extension that **teaches you to code instead of coding for you**. It lives in the right-hand sidebar, reads what you wrote, and responds the way a good senior engineer or TA does: with questions, hints and "did you think about…?", never with the finished answer. When it has something to say about a specific line, a small panda walks over to that line in your editor.

Built for students learning a new language or their first data structures. The goal is a free educational tool for UIUC courses.

> Using AI shouldn't mean handing your thinking over to it. The mentor makes you think at least as much as you code.

## What it does

| | |
|---|---|
| **Check my plan** | Describe your approach *before* writing code; the mentor points out gaps and edge cases. |
| **Hint ladder** | Three levels: a nudge (one question), then the concept, then a plain-English plan. Each level unlocks only after you change your code or write down what you tried. There is no fourth level with the answer. |
| **Review my attempt** | One thing you did well, then questions that lead you to the bugs. No fixes. |
| **Explain error** | What the editor's error means in plain English, plus a question that helps you find the cause. |
| **Quiz me** | Questions about the code you just wrote: predict the output, the complexity, an edge case. |
| **Teach me** | Learn a topic or a new language with tiny examples and an exercise to try in your editor. |
| **Panda in your editor** | After a review, hint or error explanation, the panda walks down the gutter to each line the mentor pointed at and sits there with a short question. Hover the line for the full explanation, **Explain more**, **Next stop** or **Got it**. Edit the line and it heads back to the sidebar. |
| **Save nudges** | On save, the panda may ask one question about a pattern it noticed: nested loops, recursion with no base case, swallowed exceptions, very long functions. No AI is involved. If that line is on screen, the panda walks to it; it never scrolls your editor on its own. |
| **Visualize anything** | Describe what you want to see ("reversing a linked list", "collisions in a hash map", "DFS on a graph"), or press **My code** to trace your own selected code with a small input. Arrays, linked lists, stacks, queues, trees, graphs, hash tables and variables animate step by step, with nodes and pointers sliding between states. Six examples work offline. |
| **Sorting & search** | Built-in animations of bubble, selection, insertion, merge and quick sort, binary search and BST insertion, with pseudocode. |
| **Predict mode** | Every visualization can pause before a step and ask what happens next. |
| **Progress** | Streak, concepts practiced, hints used, prediction accuracy, and a *think-to-hint ratio*. |

## Guardrails are code, not a prompt

Telling an AI model "don't give the answer" isn't enough: models drift, and students learn how to ask around it. The mentor's limits are enforced by plain, deterministic code that runs before and after the model ([`src/guardrails.ts`](src/guardrails.ts)), so the same input always gets the same result:

1. **Request filter.** Requests that delegate the work ("write it for me", "give me the full code", "solve this", "ignore your instructions") never reach the model. The student gets a redirect that asks them a question instead.
2. **Output filter.** Every reply streams through a filter that hides fenced or unfenced code longer than **3 lines** or **120 characters**, and inline code longer than 60 characters. A hidden block is replaced by a note telling the student to write it themselves.
3. **Hint ladder.** The extension, not the model, decides how much help to give, and requires proof of effort between rungs ([`src/hintLadder.ts`](src/hintLadder.ts)).
4. **Visualizations are data, not code.** The model returns a scene: snapshots of data structures checked against a schema ([`src/scene.ts`](src/scene.ts)). Unknown references are dropped, sizes are capped, and every caption goes through the output filter.

The limits are unit-tested (`npm test`). In a live test, a small local model ignored the prompt and wrote a full 19-line binary search; the output filter hid it.

## Install

### From a release (.vsix)

1. Download `senior-dev-mentor-x.y.z.vsix` from the [Releases page](../../releases).
2. In VS Code: **Extensions** → `⋯` → **Install from VSIX…**, or run:

   ```bash
   code --install-extension senior-dev-mentor-0.1.0.vsix
   ```

3. Open the **Mentor** view in the secondary (right) sidebar. If the secondary sidebar is closed, toggle it with **View → Appearance → Secondary Side Bar**, or run **Mentor: Open Mentor** from the Command Palette.

### Choose an AI model

- **Claude (recommended):** run **Mentor: Set Anthropic API Key** from the Command Palette. The key is kept in VS Code's encrypted secret storage. `ANTHROPIC_API_KEY` in your environment also works. The default model is `claude-opus-5-5`; change it, or lower `seniorDevMentor.effort`, in settings.
- **Ollama (free, offline):** install [Ollama](https://ollama.com), run `ollama pull qwen2.5-coder:7b` (or another model), and set `seniorDevMentor.provider` to `ollama` and `seniorDevMentor.ollamaModel` to that model. Small local models (1–3B) often give wrong explanations and can't build visualizations; use the biggest model your machine can run. The guardrails apply to every provider.

## Settings

| Setting | Default | |
|---|---|---|
| `seniorDevMentor.provider` | `anthropic` | `anthropic` or `ollama` |
| `seniorDevMentor.anthropicModel` | `claude-opus-5-5` | Claude model ID |
| `seniorDevMentor.effort` | `medium` | `low` is faster and cheaper |
| `seniorDevMentor.ollamaModel` | `llama3.2` | Any model you've pulled |
| `seniorDevMentor.ollamaUrl` | `http://localhost:11434` | |
| `seniorDevMentor.maxCodeLines` | `3` | Longest code example shown (0–8) |
| `seniorDevMentor.nudgeOnSave` | `true` | Panda questions on save |
| `seniorDevMentor.mascot` | `true` | Show the panda |
| `seniorDevMentor.editorPanda` | `true` | Let the panda walk to lines in your editor |

## Icons

The interface uses [Codicons](https://github.com/microsoft/vscode-codicons), the icon font VS Code itself uses, so the sidebar matches the editor in every theme. No emoji.

## Develop

```bash
npm install
npm test          # guardrails, hint ladder, heuristics, scenes, visualizer
npm run build     # bundles to dist/extension.js
npm run test:vscode   # editor-panda checks inside a real VS Code (uses your installed copy)
```

Press **F5** in VS Code to launch an Extension Development Host. To work on the sidebar UI in a normal browser with a fake mentor, run `node dev/preview.mjs` and serve the project folder (for example `python3 -m http.server`), then open `/dev/preview.html`.

```
src/
  extension.ts      activation, commands, save nudges
  mentorView.ts     sidebar webview, the request → guard → model → guard pipeline
  guardrails.ts     deterministic request + output filters
  scene.ts          "visualize anything" schema, validation, line references
  editorPanda.ts    the panda's walks and notes in the editor
  hintLadder.ts     effort-gated hint levels
  heuristics.ts     no-AI code observations for save nudges
  prompts.ts        the mentor's teaching style
  providers/        Claude (Anthropic SDK) and Ollama
media/              webview: chat, panda, scene player, visualizer, progress
media/panda/        gutter sprites for the editor panda
test/               node:test suites
```

## How it was designed

Before writing any code, we used [REA](https://github.com/morluto/rea) to statically analyze two existing extensions:

- **Claude Code for VS Code:** registers a webview view in the `secondarySidebar` container (the right-hand sidebar) with `retainContextWhenHidden`, uses a CSP built from `webview.cspSource`, and listens for editor selection changes and diagnostics to build context. We use the same approach.
- **vscode-pets:** each pet is a state machine (walk, run, sit, chase…) advanced by a 100 ms timer, moved by setting `style.left`/`style.bottom` on the sprite inside a webview. The panda uses the same pattern with a CSS-only sprite and adds moods (thinking, talking, cheering, noticing something). Pets can't leave their panel; our panda can, by swapping gutter-icon decorations in the editor frame by frame.

## License

[MIT](LICENSE). Contributions welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
