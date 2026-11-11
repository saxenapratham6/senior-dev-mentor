# Plan: Repo Tour and Deploy Check

Status: plan only, nothing built yet. Target: versions 0.8 to 1.1.

## 1. What we're building

Today the mentor understands one file at a time: the one you have open. This phase teaches it to understand a **whole repository** and walk someone through it, the way a senior engineer onboards a new teammate on their first day:

1. **The big picture.** What the project is for, who uses it, and how it works, in plain English.
2. **The map.** How the folders are organized, which files matter most and why, and which you can ignore.
3. **The guided walk.** The panda opens the important files one by one, walks to the lines that matter, explains them, and asks a question to check understanding before moving on.
4. **Follow a request.** "What happens when a user clicks Log in?", traced across files, step by step, on the panda's board.
5. **Deploy check.** "I want to deploy this." The mentor works out what kind of app it is, what deploying it needs, what's missing or risky, and explains each step so the student can do it themselves.

It works for two kinds of people, picked when the tour starts and changeable at any time:

| | **New to this** | **Experienced** |
|---|---|---|
| Who | A student who has never read a real codebase, or doesn't know this language or framework | An engineer joining a project, reviewing a repo, or picking up an open-source issue |
| Pace | Short stops, one idea at a time, every term explained on first use | Fewer, denser stops; skips basics |
| Vocabulary | "A *route* is the address the server listens on, like `/login`." | "Express router, mounted at `/api` in `app.ts:14`." |
| Questions | Check understanding at every stop | Optional; a quiz at the end of each chapter |
| Tour length | 8 to 15 stops | 5 to 10 stops, plus "go deeper" branches |

A third, hidden level, **Explain like I'm new to programming**, is offered when the student says they're lost twice in a row. It explains what a file, a function and an import are before going on.

### What stays true from the rest of the extension

- **It teaches; it doesn't do the work for you.** The tour explains code that already exists, so it may *point at* any amount of the repo's own code. It still never writes new code for the student: fixes, features and config files go through the same guardrails as everything else (section 8).
- **The panda is the guide.** It walks to the lines being explained, across files, and draws diagrams on its board.
- **Deterministic first.** Anything a program can work out for certain (file list, languages, frameworks, entry points, imports, scripts, deploy config, environment variables) is computed by plain, tested code. The model only explains and connects what that code found. This makes tours cheaper and faster, and stops the model from inventing files that don't exist.

## 2. User experience

### 2.1 Starting a tour

Entry points:

- A new sidebar action button: **Tour** (codicon `compass`).
- Command palette: **Mentor: Tour This Repository**, **Mentor: Explain This File**, **Mentor: Explain This Folder**, **Mentor: How Do I Deploy This?**
- Explorer right-click on a file or folder: **Explain with the Mentor**.
- The first time a workspace with more than 20 source files is opened, the panda offers once: *"New project? Want me to show you around?"* (never again for that workspace; can be turned off).

Start screen, on the panda's board:

1. **What do you want?**
   - *Show me around* (full tour)
   - *I need to change something* (the student describes the task; the tour focuses on the files that task touches)
   - *Follow what happens when…* (a request or event trace)
   - *How do I deploy this?*
2. **How familiar are you?** New to this / Experienced, plus an optional "I know: Python, React, SQL…" chip list, prefilled from the languages found in the repo. Remembered per workspace.
3. **Privacy line**, always visible before anything is sent: *"I'll send summaries and selected parts of about 42 files (≈ 38k tokens, about $0.20 with Claude) to Claude. Secrets and `.env` files are never sent."* With Ollama: *"Everything stays on this computer."* Buttons: **Start** and **See what gets sent**, which lists the files.

### 2.2 The tour itself

A tour is a list of **chapters**, and each chapter is a list of **stops**.

Example for a Flask + React app, *New to this* level:

1. **The big picture** (board only)
   - What this app does, in two sentences, drawn from the README, package names and routes.
   - An **architecture diagram** on the board: browser → React frontend → Flask API → PostgreSQL, built from the dependency graph and config files. Each box is clickable and jumps to that part of the tour.
   - "Words you'll see": a short glossary of the terms this repo uses (API, route, component, ORM, migration), only those that actually appear.
2. **The map** (board plus Explorer)
   - A folder tree with each top-level folder labeled in one line ("`api/`: the server. `web/`: what the user sees. `migrations/`: database changes over time").
   - Files ranked as **Start here**, **Core**, **Supporting** and **Safe to skip** (generated, vendored, tests, config boilerplate), with the reason for each ranking.
3. **Where it starts** (editor)
   - The panda opens the entry point (`api/app.py`, `web/src/main.tsx`) and walks to the line where the program begins.
   - "Everything else is reached from here."
4. **One feature, end to end** (editor and board)
   - Picks the most central feature (for example login) and follows it file by file: the form component, the fetch call, the route, the handler, the database query, the response.
   - The panda walks across files; the board shows a sequence diagram that highlights the current step.
5. **The rest of the core files**, one stop each.
6. **How it's tested and run** (scripts, test folder, CI).
7. **Recap and quiz**: three questions ("Where would you add a new API route?"), then a saved summary like the wrap-up.

At each stop:

- The editor opens the file (or a preview tab, so a tour doesn't leave twenty tabs open) and the panda walks to the line range.
- The speech bubble has one sentence; hovering the line shows the full explanation (the same mechanism as review stops today).
- The sidebar shows the stop's explanation with buttons: **Next**, **Back**, **Explain simpler**, **Go deeper**, **Why does this matter?**, **Skip chapter**, **Ask about this**.
- New to this: a short check question every 2 or 3 stops ("Before I show you: which file do you think handles saving the post?"). The student can answer or skip. Answers are graded gently by the model; a wrong guess becomes the next explanation's starting point.
- The board shows the stop's place on the map, with the current file highlighted, so the student never loses track of where they are.

Progress is saved per workspace: the student can stop and resume where they were, and finished chapters are checked off.

### 2.3 Explain this file, explain this folder

A shorter, single-file version of the tour that you can start from anywhere:

- **File:** its purpose, who calls it (incoming imports), what it uses (outgoing imports), its main parts as two to six stops, and one question.
- **Folder:** its role, its files ranked, and how it connects to its siblings.

### 2.4 Follow what happens when…

The student types "a user signs up", "I run `npm start`" or "the cron job fires".

1. Deterministic code finds candidate entry points: matching route strings, CLI commands, event names, script names and handler names.
2. The model picks the path and orders it, but may only use files and symbols from the index (validated, like scenes are today).
3. The board shows a sequence diagram (actors along the top, numbered arrows). The panda walks the editor through each hop in step with the board.

This reuses the board's scene player. Add a `sequence` structure kind next to `array`, `graph` and the others.

### 2.5 Deploy check

The student asks "How do I deploy this?" or "Can I put this on Vercel?"

On the board:

1. **What you have.** "This is a Next.js app with an API route and a PostgreSQL database." Detected, not guessed (section 5).
2. **Where it can go.** Two or three options that fit, with honest trade-offs: free tier, cold starts, whether it needs a database add-on, and how hard it is. If deploy config already exists (`vercel.json`, `fly.toml`, a `Dockerfile`, `.github/workflows/deploy.yml`), that target comes first: "This repo is already set up for Fly.io."
3. **Readiness checklist.** Every item is a deterministic check with a pass, warn or fail state, an explanation of *why it matters*, and a **Show me** button that makes the panda walk to the relevant line:
   - Build command exists and is named in a standard way.
   - Start command exists; the server listens on `process.env.PORT` / `os.environ["PORT"]`, not a hard-coded port.
   - Server binds to `0.0.0.0`, not `localhost` (for containers).
   - Every environment variable the code reads is listed in `.env.example` or documented. "Your code reads `DATABASE_URL` and `STRIPE_KEY`; only `DATABASE_URL` is in `.env.example`."
   - No secrets committed: `.env` is in `.gitignore`, and there are no key-shaped strings in tracked files (the check reports the file and line, never the value).
   - A lockfile is committed and matches the package manager.
   - The runtime version is pinned (`engines`, `.nvmrc`, `.python-version`, `runtime.txt`).
   - Debug mode is off in production (`DEBUG = True`, `app.run(debug=True)`).
   - Database migrations exist and the deploy runs them.
   - Health check endpoint (warn only).
   - CORS and allowed hosts are set for the production domain (warn only).
   - Static assets are built, not committed (warn only).
4. **The steps, explained.** A numbered walkthrough for the chosen target: create the account and project, set each environment variable (by name, with what it's for and where to get it), connect the repo, set the build and start commands, run migrations, deploy, and check the logs. Each step says *why*, not just *what*. Commands are shown as short one-liners the student runs themselves (`fly launch`, `vercel --prod`), each with an explanation.
5. **What could go wrong.** The three most likely failures for this stack ("If the logs say `Error: listen EADDRINUSE`…"), and how to read the logs.

The mentor never runs deploy commands, never logs into anything, and never reads the *values* in `.env` files. Missing files such as a `Dockerfile` are explained (what each part must do, with a pointer to official docs) rather than written for the student. See section 8 and the open question in section 13.

## 3. Architecture

```
                 ┌────────────────────── deterministic, tested, no AI ───────────────────────┐
workspace ──▶ Scanner ──▶ Analyzers ──▶ RepoIndex ──▶ Ranker ──▶ TourSkeleton
  files        (ignore,     (language,    (files,      (importance   (chapters and
               size,        manifests,    symbols,     score with    candidate stops)
               secrets)     imports,      edges,       reasons)
                            entry points, scripts,
                            deploy, env)  deploy facts)
                 └───────────────────────────────────────────────────────────────────────────┘
                                               │
                                               ▼
                        Summarizer (model, map-reduce, cached by file hash)
                                               │
                                               ▼
                    TourWriter (model, structured output, validated against the index)
                                               │
                                               ▼
                Tour ──▶ TourPlayer ──▶ EditorPanda (walks across files)
                                    ├─▶ PandaBoard (map, diagram, sequence, checklist)
                                    └─▶ MentorView (stop text, buttons, questions)
```

### 3.1 New modules

| File | Purpose | Pure and unit-tested? |
|---|---|---|
| `src/repo/scan.ts` | Walk the workspace with `vscode.workspace.findFiles`; apply ignore rules; record path, size, hash and language for each file | The filtering logic, yes |
| `src/repo/ignore.ts` | `.gitignore` plus built-in ignore lists (`node_modules`, `dist`, `.venv`, `__pycache__`, lockfiles for content, binaries, minified files, files over 200 KB) | Yes |
| `src/repo/secrets.ts` | Never-send list (`.env*` except `.env.example`, `*.pem`, `id_rsa*`, `credentials*`, `*.key`) and a key-shaped string detector (AWS, Stripe, GitHub, Anthropic, OpenAI and Google patterns; long high-entropy strings next to `key`, `secret` or `token`) | Yes |
| `src/repo/languages.ts` | Extension and shebang to language; lines of code per language | Yes |
| `src/repo/manifests.ts` | Parse `package.json`, `pyproject.toml`, `requirements.txt`, `Pipfile`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, `Gemfile`, `composer.json`, `*.csproj`; get the name, dependencies and scripts | Yes |
| `src/repo/frameworks.ts` | Detect frameworks from dependencies plus file markers (Next.js, React with Vite, Express, NestJS, Flask, Django, FastAPI, Spring Boot, Rails, Laravel, Go net/http, Gin, Rust Axum, Android, iOS and Flutter) | Yes |
| `src/repo/imports.ts` | Extract import edges with tested regular expressions for JS/TS, Python, Go, Java, Rust and C/C++; resolve relative paths and `tsconfig` paths | Yes |
| `src/repo/symbols.ts` | Top-level symbols per file through the `vscode.executeDocumentSymbolProvider` command (uses the user's language extensions), with a regex fallback | Fallback, yes |
| `src/repo/entryPoints.ts` | Find where programs start: `main` fields, `bin`, scripts, `if __name__ == "__main__"`, `manage.py`, `app = Flask(`, `func main()`, `src/main.rs`, `index.html` script tags, and route registrations | Yes |
| `src/repo/routes.ts` | Find HTTP routes and CLI commands (Express `app.get(`, Flask `@app.route`, FastAPI `@router.post`, Django `urls.py`, Next.js `app/**/page.tsx` and `route.ts`, Spring `@GetMapping`) | Yes |
| `src/repo/deploy.ts` | Detect deploy targets and run readiness checks (section 5) | Yes |
| `src/repo/env.ts` | Environment variables read by the code (`process.env.X`, `os.environ["X"]`, `os.getenv("X")`, `Deno.env.get`, `std::env::var`, `System.getenv`) compared with `.env.example` and the docs; names only | Yes |
| `src/repo/rank.ts` | Importance score (section 4) | Yes |
| `src/repo/index.ts` | Builds the `RepoIndex`; incremental updates when files change | Mostly |
| `src/repo/cache.ts` | Summaries cached in `globalStorageUri/repos/<workspace hash>/`, keyed by file content hash, prompt version and model | Yes |
| `src/tour/schema.ts` | Zod schemas for `RepoOverview`, `FileSummary`, `Tour`, `Chapter`, `Stop`, `Trace` and `DeployPlan`, plus `normalizeTour(raw, index)`, which drops anything that isn't in the index (like `normalizeScene`) | Yes |
| `src/tour/summarize.ts` | Map-reduce summaries (section 6) | Prompt building, yes |
| `src/tour/write.ts` | Builds the tour from the skeleton and the summaries | Prompt building, yes |
| `src/tour/player.ts` | Tour state machine: current stop, next, back, skip, resume, branches | Yes |
| `src/tour/progress.ts` | Saved per-workspace progress in `workspaceState` | Yes |
| `media/tour.js`, `media/tour.css` | Board views: repo map, architecture diagram, ranked file list, sequence diagram, deploy checklist | Checked in the browser preview |

### 3.2 Changes to existing modules

- **`editorPanda.ts`:** `tour()` currently works within one document. Generalize the stop to `{ uri, line, endLine?, note }`. When the next stop is in another file, the panda "walks off" the edge of the current editor (a short exit animation), the next file opens in a preview tab, and the panda walks in from the top. Reuse `stepOut()` and `stepIn()`.
- **`board.ts`:** new message types: `repoMap`, `architecture`, `fileRank`, `sequence`, `deployChecklist`, `tourProgress`. Clickable nodes send `tourJump` to the extension.
- **`scene.ts`:** add a `sequence` structure kind (actors and messages) and a `boxes` kind (architecture: boxes, groups and arrows), with the same caps and validation.
- **`mentorView.ts`:** a new `tour` mode next to chat, with its own buttons. Add a `RepoContext` to the system prompt for chat while a tour is open, so "what does this do?" questions know about the repo, not just the open file.
- **`guardrails.ts`:** a new guard profile, `explainExisting` (section 8).
- **`summary.ts`:** the wrap-up includes tour progress and quiz results.
- **`prompts.ts`:** new prompts: `overview`, `fileSummary`, `folderSummary`, `tourWriter`, `traceWriter`, `deployExplainer`, `checkAnswer`. Each has a version number that's part of the cache key.

## 4. Deciding which files are important

Ranking is deterministic, explainable and tested. Each file gets a score from 0 to 100, plus the reasons that produced it. The reasons are shown to the student ("Imported by 14 files", "The program starts here").

| Signal | Weight | Notes |
|---|---|---|
| Entry point (section 3.1) | +40 | `main`, server start, app root component |
| Incoming imports (fan-in) | up to +25 | Log-scaled; central modules |
| Defines routes, CLI commands or exported public API | +15 | |
| Named in the README | +10 | "Start in `src/core/`" |
| Recently and often changed (git log, last 6 months) | up to +10 | Only if git is available; `git log --name-only` run with `execFile`, read only |
| Size (lines of code) | up to +5 | Small boost; a very large file isn't automatically important |
| Config that controls behavior (`next.config.js`, `settings.py`, `docker-compose.yml`) | +8 | Shown in its own "Configuration" chapter |
| Tests | ×0.3 | Shown in "How it's tested", not in the core path |
| Generated, vendored, migrations, fixtures, snapshots | ×0.1 | "Safe to skip", with the reason |
| Duplicates (same hash) | ×0 | |

Buckets: **Start here** (top 3 entry points), **Core** (score ≥ 50, at most 12), **Supporting** (20 to 49), **Safe to skip** (the rest, grouped by reason).

For the "I need to change something" goal, the student's task text is matched against file names, symbols, routes and summaries (keyword overlap, then a model re-rank of the top 30) to build a focused tour instead.

## 5. Deploy check: detection and checks

### 5.1 What kind of app is it?

`AppKind`: `static-site` | `spa` | `ssr-web` | `api-server` | `fullstack` | `worker` | `cli` | `library` | `mobile` | `desktop` | `notebook` | `unknown`, with evidence for each guess. Libraries and CLIs get "publish" guidance (npm, PyPI, crates.io, GitHub Releases) instead of hosting guidance. Mobile apps get store-release guidance in outline only.

### 5.2 Existing deploy config

Detected from files: `Dockerfile`, `docker-compose.yml`, `Procfile`, `vercel.json`, `netlify.toml`, `fly.toml`, `render.yaml`, `railway.json` / `railway.toml`, `app.yaml` (Google App Engine), `serverless.yml`, `template.yaml` (AWS SAM), `cdk.json`, `*.tf` (Terraform), `k8s/` and Helm charts, `.github/workflows/*.yml` with deploy steps, `firebase.json`, `wrangler.toml` (Cloudflare), `amplify.yml`, `Dockerrun.aws.json`, `nixpacks.toml`.

### 5.3 Target catalog

The catalog is a data file, `deploy/targets.json`, so contributors can add or fix entries without touching code. Each target lists:

- Which app kinds and stacks it fits.
- Free-tier notes, with a "last checked" date so stale advice is visible.
- Required files and settings.
- The steps, as a template filled in from the index (build command, start command, environment variable names).
- Common failures and what they mean.
- Links to the official docs.

Initial targets: Vercel, Netlify, GitHub Pages, Render, Railway, Fly.io, Cloudflare Pages/Workers, Google Cloud Run, AWS (App Runner, and Elastic Beanstalk at an outline level), Heroku, and a plain Docker host/VPS.

### 5.4 Readiness checks

Each check is a pure function `(index) → { id, status: "pass" | "warn" | "fail" | "n/a", where?: {file, line}, why: string, fix: string }`. `fix` is a *description* of what to change, not code. The full list is in section 2.5. Every check has unit tests against fixture repos, with one passing and one failing fixture per check.

### 5.5 The model's part

The model receives the app kind, the detected config, the check results and the target template, and writes the plain-English explanation at the student's level. Its output is a `DeployPlan` schema (`targets[]`, `steps[]`, `risks[]`). Step commands must match the target's command allowlist in `targets.json`; any other command is dropped. The model can't add checks or change their status.

## 6. Making the model understand a big repo

Repos don't fit in one prompt, and most of a repo isn't worth sending. The approach:

1. **Budget.** The default budget is 60k input tokens for a full tour. It's set by `seniorDevMentor.tourBudget` (small, medium or large) and shown before starting.
2. **Send structure, not everything.**
   - Every tour sends the deterministic index: the tree (collapsed below depth 4), languages, frameworks, manifests, scripts, entry points, routes, import graph edges between ranked files, and environment variable names. This is typically 3k to 8k tokens.
3. **Map step: summarize files.**
   - Only files in Start here, Core and the top of Supporting get a `FileSummary`: a one-line purpose, its main symbols with a sentence each, what it depends on, notable line ranges with a reason for each, and a confidence score.
   - Summaries are produced in batches of files that fit about 12k tokens each.
   - Files longer than 400 lines are sent as an outline: the symbols, plus the first and last 40 lines of each important symbol.
   - Summaries use `messages.parse` with a zod schema and `effort: low`, and run in parallel with a limit of 4 at a time.
4. **Reduce step.**
   - Folder summaries are built from file summaries, then the `RepoOverview` (purpose, users, architecture boxes and arrows, glossary) from folder summaries plus the README.
5. **Write the tour.** One call with the overview, the ranked skeleton, the summaries and the student's level and goal produces the `Tour`. Here `effort` is medium.
6. **Validate.**
   - `normalizeTour` drops stops whose file isn't in the index or whose lines are out of range, and clamps line ranges.
   - It checks that each stop's anchor text (a short snippet the model must quote) appears in the file. If the snippet isn't found, the stop is moved to the nearest matching symbol or dropped. This is the main defense against confident nonsense.
7. **Cache.**
   - Summaries are keyed by content hash, so a second tour is nearly free, and a `git pull` only re-summarizes changed files.
   - The overview is keyed by the hash of all summaries.
   - Anthropic prompt caching is applied to the index block, which every call in a tour shares.
8. **Lazy depth.** "Go deeper" on a stop summarizes that file's neighbors only when it's asked for.
9. **Ollama.**
   - Small models get a smaller budget, an outline-only map step, and a simpler tour schema (no sequence diagrams).
   - A warning says explanations may be less accurate. The deterministic parts (map, ranking, deploy checks) work fully offline with no model at all, so a **No-AI tour** is available: map, ranked files, entry points and deploy checklist, using fixed text templates.

## 7. Data model (draft)

```ts
type Level = "new" | "experienced";
type Goal = { kind: "overview" } | { kind: "change"; task: string } | { kind: "trace"; question: string } | { kind: "deploy"; target?: string };

interface Stop {
  id: string;
  uri: string;              // must exist in the index
  line: number; endLine?: number;
  anchor: string;           // short quote that must be found in the file
  bubble: string;           // ≤ 90 chars, shown in the editor
  explain: string;          // markdown, guarded
  deeper?: string;          // shown on "Go deeper"
  simpler?: string;         // shown on "Explain simpler" for experienced→new switch without a new call
  terms?: { term: string; meaning: string }[];
  check?: { question: string; kind: "predict" | "locate" | "why"; expect?: string };
  board?: { view: "map" | "architecture" | "sequence"; highlight: string[] };
}
interface Chapter { id: string; title: string; why: string; stops: Stop[] }
interface Tour { version: 1; repoHash: string; level: Level; goal: Goal; overview: RepoOverview; chapters: Chapter[] }
```

Caps, like `LIMITS` in `scene.ts`: 8 chapters, 40 stops, 600 characters per explanation, and 3 checks per chapter.

## 8. Guardrails for this phase

The current output filter hides any code over 3 lines, which is right for "don't write my homework", but a tour must be able to *show* existing code. The rule becomes **"show the repo's code, don't write new code"**:

1. **Point, don't paste.** Tour explanations refer to line ranges. The extension shows the *real* lines from disk in the editor (and in the hover), so they can't be invented or altered. The model's own text still goes through `SolutionGuard`.
2. **Quoted code must match the repo.** A new `explainExisting` guard profile allows a longer code block only if it matches the file's text at that location, after normalizing whitespace. Anything else over the normal limits is hidden, as today.
3. **New code is still guarded.** "Add the endpoint for me", "write my Dockerfile" and "fix the deploy" go through `classifyRequest` and are redirected, as they are now. The tour explains *what* the missing piece must do.
4. **Deploy commands.** Only one-line commands from the target's allowlist are shown. The mentor never executes them.
5. **Secrets.**
   - Never-send files are excluded at the scanner, before anything can reach a prompt.
   - Key-shaped strings in files that *are* sent are replaced with `«redacted: looks like an API key»`.
   - Checks report the location of a committed secret, never its value.
   - All of this is tested with planted fake keys in fixture repos.
6. **Consent.** Nothing from a repo is sent until the student presses **Start** on the screen that shows the file count and token estimate. For workspaces with a `.mentorignore` file, the listed paths are never sent. The No-AI tour sends nothing.
7. **Academic integrity.** For a course repo (detected from a `.mentor-course` marker file a course staff can add), tour mode can be limited to the overview and map so it doesn't explain the assignment solution. This is set by course staff, not the student.

## 9. Testing and evaluation

### 9.1 Fixture repos

The fixture repos live in `test/fixtures/repos/` and are kept small, at most 30 files each:

- `flask-todo`: Flask, SQLite and Jinja templates, a hard-coded port and `debug=True` (deploy check fails).
- `express-api`: Express with Postgres, a Dockerfile, a `.env.example` that's missing one variable, and a planted fake key.
- `vite-react-spa`: a static deploy to Netlify or GitHub Pages.
- `nextjs-fullstack`: the app router, API routes, Prisma and `vercel.json`.
- `fastapi-service`: `fly.toml`, Alembic migrations and a health check (deploy check passes).
- `python-cli`: a CLI with publish-to-PyPI guidance.
- `go-http`: Go `net/http` with a `Procfile`.
- `monorepo`: `apps/web`, `apps/api` and `packages/shared` with npm workspaces.
- `messy`: no README, deep nesting, generated files, and a vendored library.
- This repo itself (dogfooding).

### 9.2 Unit tests (node:test, no model)

- Every analyzer gets an expected `RepoIndex` snapshot per fixture.
- The ranking tests check that the expected "Start here" files rank first in each fixture.
- Each deploy check gets one passing and one failing fixture.
- Secret handling: planted keys never appear in any built prompt string. This test scans every prompt the code can build for each fixture.
- `normalizeTour` must drop invented files, out-of-range lines and anchors that don't match.
- The player state machine is tested for next, back, skip, resume and branch.

### 9.3 Integration tests (real VS Code, `test/integration`)

- Opening a fixture workspace and running **Tour** with a stub provider (a fake, fixed tour) checks that the panda opens the right files in order, walks to the lines, survives switching files and preserves the student's own tabs.
- Resume after reload works.
- The deploy checklist renders, and **Show me** walks to the failing line.

### 9.4 Model evaluation

This is a script in `dev/eval-tours.ts`, run by hand before a release and never in CI.

- It runs real tours on the fixtures with Claude and with one Ollama model.
- It scores each tour automatically:
  - The percentage of stops that survive validation (target ≥ 95%).
  - Whether the overview names the right framework and app kind.
  - The deploy plan's target appears in the fit list.
- It also outputs a human-review sheet:
  - Was the explanation correct? Was it pitched at the right level?
  - Would a new student understand it?
  - Ask Oscar and two or three students to rate tours at both levels.

### 9.5 Performance targets

- The No-AI index for a repo of 2,000 files takes under 3 seconds.
- The first stop appears in under 20 seconds with Claude: the overview streams while the map step continues in the background, and the tour starts as soon as chapter 1 is ready.
- A second tour on an unchanged repo starts in under 5 seconds (from the cache).
- A large repo, such as the VS Code source: when the scan stops at 20,000 files, the tour narrows to the folder the student picks and says that it has.

## 10. Milestones

Each milestone ships as its own release, and each is useful on its own.

### 0.8: Repo map (no AI)

- The scanner, ignore rules, secrets list, languages, manifests, frameworks, imports, entry points, ranking and the cache skeleton.
- Board views: the repo map and the ranked file list with reasons. Commands: **Explain this folder** and **Explain this file**, deterministic parts only.
- The **No-AI tour**: an ordered walk through the Start here and Core files, with template text ("This file is imported by 14 others. It starts the server.").
- Tests: the fixtures, the analyzer snapshots and the ranking checks.
- *Done when* all fixtures rank their known entry points first, the No-AI tour walks across files in VS Code, and the integration test passes.

### 0.9: Guided tour (AI)

- Summarizer (map-reduce, cache, prompt caching), RepoOverview, the architecture diagram, TourWriter, `normalizeTour` with anchor checks, and the player with Next, Back, Simpler, Deeper and Ask.
- The New and Experienced levels, check questions, resume, and the privacy and consent screen with a token estimate.
- The `explainExisting` guard profile.
- *Done when* evaluation shows ≥ 95% of stops valid on all fixtures, a new-to-coding student can explain the fixture apps' structure after a tour (informal test with 3 students), and the secret-leak test passes.

### 1.0: Follow a request, and focused tours

- Route and CLI detection, the `sequence` scene kind, the trace writer and synchronized panda and board.
- The "I need to change something" focused tour.
- The tour recap and quiz in the wrap-up.
- *Done when* traces on `express-api`, `flask-todo` and `nextjs-fullstack` follow the correct files in order, as checked by hand.

### 1.1: Deploy check

- The `deploy.ts` checks, `env.ts`, `targets.json`, the board checklist with Show me, the DeployPlan writer with the command allowlist, and "What could go wrong".
- *Done when* every check has a passing and a failing fixture, every target in the catalog has docs links and a "last checked" date, and a student deploys `flask-todo` to Render by following only the mentor's steps.

## 11. Settings to add

| Setting | Default | |
|---|---|---|
| `seniorDevMentor.tourLevel` | `ask` | `new`, `experienced` or `ask` |
| `seniorDevMentor.tourBudget` | `medium` | Token budget per tour |
| `seniorDevMentor.offerTourOnOpen` | `true` | Offer a tour once for new, larger workspaces |
| `seniorDevMentor.tourMaxFiles` | `20000` | Scanning stops here |
| `seniorDevMentor.useGitHistory` | `true` | Use `git log` for ranking |

Plus `.mentorignore` in the workspace, using gitignore syntax.

## 12. Risks and how we handle them

| Risk | Handling |
|---|---|
| The model invents files, functions or behavior | Index-only references, anchor checks, the evaluation stop-validity target, and showing real lines from disk |
| A tour is too long or boring | Chapter caps, skip chapter, per-level stop counts, and starting with *one* feature end to end instead of file by file |
| Cost on large repos | Budget setting, estimate before start, caching, lazy depth, `effort: low` for summaries |
| Leaking secrets or private code | Never-send list, redaction, consent screen, `.mentorignore`, the No-AI mode, Ollama, and the prompt-scan test |
| Deploy advice goes stale (free tiers change often) | A data-file catalog with "last checked" dates, links to official docs, and wording like "at the time of writing" |
| Framework detection misses a stack | Falls back to `unknown` with generic guidance; the analyzers are plug-in style, so contributors can add stacks |
| Walking across files feels disorienting | Preview tabs, the board shows "you are here" on the map, Back always returns to the previous file and line, and the student's own tabs are restored at the end |
| A student uses the tour to understand someone else's assignment solution | The course-staff marker file (section 8) |

## 13. Open questions for you

1. **Writing deploy files:** for a missing `Dockerfile`, `Procfile` or `.env.example`, should the mentor (a) only explain what the file must contain (fits the current teaching rule), (b) write it after the student has tried, or (c) write it, since this is configuration rather than coursework? The plan assumes (a), with `.env.example` as an exception, because it only lists names.
2. **Which deploy targets matter most** for UIUC students? The plan starts with Render, Vercel, Netlify, GitHub Pages and Fly.io.
3. **Is the course-marker restriction wanted**, and should course staff be able to configure more than "overview only"?
4. **Remote repos:** should **Tour a GitHub repo by URL** (clone into temporary storage, then tour) be in scope, or only the open workspace?
5. **Languages for the first release:** the plan covers JS/TS, Python, Go and Java analyzers in 0.8, and Rust, C/C++, Ruby and PHP later. Is that the right order?
