# Senior Dev Mentor

An open-source VS Code extension that **teaches you to code instead of coding for you**. It lives in the right-hand sidebar, reads what you wrote, and responds the way a good senior engineer or TA does: with questions, hints and "did you think about…?", never with the finished answer. When it has something to say about a specific line, a small panda walks over to that line in your editor.

Built for students learning a new language or their first data structures. The goal is a free educational tool for UIUC courses.

> Using AI shouldn't mean handing your thinking over to it. The mentor makes you think at least as much as you code.

## What it does

A panda lives in your code editor, and the sidebar is just a conversation.

| | |
|---|---|
| **The panda in your editor** | It sits beside the line you're working on and strolls over when you pause, thinks while the mentor works, and naps when you're idle. After a review, hint or error explanation it walks line by line to each spot worth a look and says a short question in a speech bubble. Hover the line for the full explanation, **Explain more**, **Next stop** or **Got it**. Edit the line and it moves on. |
| **Repo tour** | Opened a project you've never seen? Press the compass and the panda shows you around it, the way a senior engineer onboards a new teammate. The board shows the map: what the project is, where the program starts, the files that do the work (with the reasons, like "imported by 6 files" or "handles 3 web addresses"), what each folder is for, and what's safe to skip. Then the panda walks you through it file by file, line by line, from the entry point to the core files to how it's set up and tested. Choose **New to this** (every term explained the first time) or **Experienced** (short and dense). Right-click any file or folder and choose **Explain with the Mentor** for a shorter walk through just that part. It needs no AI: everything comes from reading the code, so it's fast, free and works offline. Files that may hold secrets, like `.env`, are never opened. |
| **Plan** | Describe your approach *before* writing code; the mentor points out gaps and edge cases. |
| **Hint** | Three levels: a nudge (one question), then the concept, then a plain-English plan. Each level unlocks only after you change your code or write down what you tried. There is no fourth level with the answer. |
| **Review** | One thing you did well, then questions that lead you to the bugs. No fixes. |
| **Error** | What the editor's error means in plain English, plus a question that helps you find the cause. |
| **Quiz** | Questions about the code you just wrote: predict the output, the complexity, an edge case. |
| **Show me** | The panda draws on its **board**, a panel beside your code. Type an idea ("reversing a linked list", "collisions in a hash map", "BFS"), or select your code to watch it run with a small input. Arrays, linked lists, stacks, queues, trees, graphs, hash tables and variables animate step by step; the panda walks to the part of the diagram that's changing, explains it, and asks you to predict the next move. Sorting and searching examples work offline. |
| **Wrap up** | Done for the day, or with a plan? The panda puts your session on its board: what you worked on, what you figured out, how your plan went, what's still fuzzy, and what to try next. **Save as notes** writes it to a Markdown file. |
| **Lessons** | 29 built-in lessons on the panda's board take you from Python basics to hard LeetCode. **Python core** (names and objects, strings, lists, tuples, dicts and sets, loops, functions, comprehensions, classes, errors), **Python for problem solving** (Big-O, deque/Counter/defaultdict, heaps, sorting and binary search, recursion and memoization, idioms) and **13 problem-solving patterns** (two pointers, sliding window, binary search on the answer, hashing and prefix sums, stacks, linked lists, trees, graphs, heaps, backtracking, dynamic programming, intervals and greedy, union-find and tries). Each lesson explains the *why* (like when to choose a tuple over a list), has runnable examples you predict before running, common mistakes, a quick quiz, and exercises that open as practice files with built-in checks. **Check** runs them and tells you how many pass. It never shows the answer. Pattern lessons end with a LeetCode ladder from easy to hard. |
| **My roadmap** | The map button shows your path through the lessons, then the courses you're ready for afterwards (Grokking the Coding Interview Patterns, Grind 75, company Speedrun paths). It tracks finished lessons, passed exercises and LeetCode problems solved by difficulty, and the panda tells you what's next. Progress is saved in VS Code. |
| **Save nudges** | On save, the panda may walk over to a pattern it noticed (nested loops, recursion with no base case, swallowed exceptions, very long functions) and ask one question. No AI is involved, and it never scrolls your editor on its own. |

## Lessons you can trust

Lessons are Markdown files in [`lessons/`](lessons/), one per lesson, so anyone can add or fix one. They're checked automatically:

- Every example's output is produced by running it with Python (`npm run lessons`), and a test fails if any output changes.
- Every exercise is tested both ways: the starter must fail its checks, and a reference solution (kept in `test/solutions/`, not shipped) must pass them all.
- Every LeetCode ladder problem was checked against LeetCode for its exact title, difficulty, and that it's free to solve.

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

3. Open the **Mentor** view in the secondary (right) sidebar. The panda appears in your editor. If the secondary sidebar is closed, toggle it with **View → Appearance → Secondary Side Bar**, or run **Mentor: Open Mentor** from the Command Palette.

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
| `seniorDevMentor.mascot` | `true` | Show the panda in your editor |
| `seniorDevMentor.pandaFollowsCursor` | `true` | The panda strolls to your line when you pause |
| `seniorDevMentor.tourLevel` | `new` | Repo tour: `new` explains every term; `experienced` is short |
| `seniorDevMentor.offerTourOnOpen` | `true` | The panda offers a tour once in a new project with 20+ code files |
| `seniorDevMentor.tourMaxFiles` | `20000` | The repo tour stops listing files after this many |
| `seniorDevMentor.useGitHistory` | `true` | Rank recently changed files a little higher (`git log`, read only) |
| `seniorDevMentor.pythonPath` | `""` | Python for running lesson examples and checking exercises (default `python3`, or `python` on Windows) |

## Icons

The interface uses [Codicons](https://github.com/microsoft/vscode-codicons), the icon font VS Code itself uses, so the sidebar matches the editor in every theme. No emoji.

## Develop

```bash
npm install
npm run lessons   # re-run every lesson example and save its output
npm test          # guardrails, hint ladder, lessons, exercises, scenes, roadmap
npm run build     # bundles to dist/extension.js
npm run test:vscode   # editor-panda checks inside a real VS Code (uses your installed copy)
npx tsx dev/tour-repo.ts <folder>   # print the repo tour the panda would give for any folder
```

Press **F5** in VS Code to launch an Extension Development Host. To work on the sidebar UI in a normal browser with a fake mentor, run `node dev/preview.mjs` and serve the project folder (for example `python3 -m http.server`), then open `/dev/preview.html`.

```
src/
  extension.ts      activation, commands, save nudges
  mentorView.ts     sidebar webview, the request → guard → model → guard pipeline
  guardrails.ts     deterministic request + output filters
  scene.ts          "Show me" scene schema, validation, line references
  summary.ts        the wrap-up: session log, schema, notes export
  roadmap.ts        the study roadmap and its progress (pure, tested)
  classroom.ts      lessons at runtime: run examples, create and check practice files
  repoGuide.ts      the repo tour: reads the workspace, shows the map, sends the panda file to file
  repo/             reading a repo without AI: files, manifests, imports, entry points, routes, ranking
  tour/             the tour itself (chapters and stops at two levels) and what the board shows
  lessons/          lesson parser, Python runner, practice-file format
  board.ts          the panda's board panel
  editorPanda.ts    the panda in the editor: follow, sleep, think, walk, speak
  pandaPlacement.ts where the panda and its bubble go (pure, tested)
  hintLadder.ts     effort-gated hint levels
  heuristics.ts     no-AI code observations for save nudges
  prompts.ts        the mentor's teaching style
  providers/        Claude (Anthropic SDK) and Ollama
lessons/            the 29 lessons, as Markdown
test/solutions/     reference solutions for every exercise (tests only)
test/fixtures/repos small sample projects (Flask, Express, React, Go, Python CLI) the repo tour is tested on
media/              sidebar chat, the board, scene player, algorithm steps
media/panda/        panda poses (sit, walk, think, talk, cheer, sleep)
test/               node:test suites
```

## How it was designed

Before writing any code, we used [REA](https://github.com/morluto/rea) to statically analyze two existing extensions:

- **Claude Code for VS Code:** registers a webview view in the `secondarySidebar` container (the right-hand sidebar) with `retainContextWhenHidden`, uses a CSP built from `webview.cspSource`, and listens for editor selection changes and diagnostics to build context. We use the same approach.
- **vscode-pets:** each pet is a state machine (walk, run, sit, chase…) advanced by a 100 ms timer, moved by setting `style.left`/`style.bottom` on the sprite inside a webview. The panda uses the same pattern with a CSS-only sprite and adds moods (thinking, talking, cheering, noticing something). Pets can't leave their panel. Our panda lives in the editor itself: like Power Mode, it injects CSS through an editor decoration, so a sprite and a speech bubble are drawn beside a line of code, and moving that decoration line by line while swapping sprites makes it walk.

## License

[MIT](LICENSE). Contributions welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
