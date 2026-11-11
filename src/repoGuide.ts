// The repo tour: reads the workspace, shows its map on the panda's board,
// and sends the panda from file to file. The map and the basic tour need no
// AI. With the student's go-ahead, an AI model can write a richer tour, which
// is checked against the real files before the panda uses it.
import * as vscode from "vscode";
import * as path from "path";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import { gitignore } from "./repo/files";
import { BUDGETS, Budget, estimateCost, indexDigest, planSend } from "./tour/ai/digest";
import { PROMPT_VERSION, SummaryCache, writeAiTour, writeAiTrace } from "./tour/ai/writer";
import { buildTrace, traceStarts, traceTour } from "./tour/trace";
import { buildChangeTour, changeCandidates } from "./tour/change";
import { deployReport, explainDeploy, DeployReport } from "./deploy/report";
import { isSecretPath } from "./repo/files";
import type { AiSetup } from "./mentorView";
import { ProviderError } from "./providers/types";
import { walkRepo, recentChanges } from "./repo/walk";
import { buildIndex } from "./repo/index";
import type { RepoIndex } from "./repo/types";
import { buildFileTour, buildFolderTour, buildRepoTour, flatStops, Level, Tour } from "./tour/tour";
import type { EditorPanda, PandaWhereabouts } from "./editorPanda";
import type { AiPanel, PandaBoard, RepoAction } from "./board";
import { repoView, tourView } from "./tour/view";

const PROGRESS_KEY = "seniorDevMentor.repoTour";
const OFFERED_KEY = "seniorDevMentor.tourOffered";
const AI_TOURS_KEY = "seniorDevMentor.aiTours";
const MAX_STOPS = 40;
const TAG = "repoGuide";

interface SavedProgress {
  at: number;
  stops: number;
}

export class RepoGuide implements vscode.Disposable {
  private index?: RepoIndex;
  private indexRoot?: string;
  private stale = true;
  private building?: Promise<RepoIndex | undefined>;
  private texts = new Map<string, string | undefined>();
  private tour?: Tour;
  private at = -1; // the panda's stop in the current tour, or -1
  private never: (p: string) => boolean = () => false; // .mentorignore
  private aiAbort?: AbortController;
  private aiStatus: { state: "idle" | "working" | "error"; text?: string; action?: "setApiKey" | "openSettings" } = { state: "idle" };
  /** Set by extension.ts: which model writes AI tours. */
  aiSetup?: () => Promise<AiSetup>;
  /** Set by extension.ts: notes for the session wrap-up. */
  onEvent?: (kind: string, detail: string) => void;
  private goal: "tour" | "trace" | "change" | "deploy" = "tour";
  private question = ""; // the last "what happens when…"
  private task = ""; // the last "I need to change…"
  private deploy?: DeployReport;
  private deployTarget?: string;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly panda: EditorPanda,
    private readonly board: PandaBoard,
  ) {
    const watcher = vscode.workspace.createFileSystemWatcher("**/*");
    const dirty = () => (this.stale = true);
    this.disposables.push(watcher, watcher.onDidCreate(dirty), watcher.onDidDelete(dirty), vscode.workspace.onDidSaveTextDocument(dirty));
    const offer = setTimeout(() => void this.maybeOffer(), 5000);
    this.disposables.push({ dispose: () => clearTimeout(offer) });
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }

  // -------------------------------------------------------------- for tests

  get repoIndex(): RepoIndex | undefined {
    return this.index;
  }
  get currentTour(): Tour | undefined {
    return this.tour;
  }
  get stop(): number {
    return this.at;
  }
  get deployCheck(): DeployReport | undefined {
    return this.deploy;
  }

  // -------------------------------------------------------------- commands

  /** Show the repo's map on the board, ready to start the tour. */
  async open(): Promise<void> {
    const index = await this.load();
    if (!index) return;
    this.goal = "tour";
    this.tour = (await this.savedAiTour()) ?? buildRepoTour(index, this.level);
    await this.render();
  }

  /** Start (or resume) the tour of the whole repo. */
  async start(at = 0): Promise<void> {
    const index = await this.load();
    if (!index) return;
    if (this.tour?.kind !== "repo" || this.tour.level !== this.level) this.tour = (await this.savedAiTour()) ?? buildRepoTour(index, this.level);
    await this.render(); // the board opens first, so the panda isn't sent off to present on it afterwards
    await this.walk(at);
  }

  /** Explain one file or folder: from the Explorer, or the file you're in. */
  async explain(uri?: vscode.Uri): Promise<void> {
    uri ??= vscode.window.activeTextEditor?.document.uri;
    if (!uri || uri.scheme !== "file") {
      void vscode.window.showInformationMessage("Mentor: open a file, or right-click one in the Explorer, to have the panda explain it.");
      return;
    }
    const index = await this.load(uri);
    if (!index || !this.indexRoot) return;
    const rel = path.relative(this.indexRoot, uri.fsPath).split(path.sep).join("/");
    if (rel.startsWith("..")) return;
    let isDir = false;
    try {
      isDir = (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.Directory;
    } catch {
      // gone: buildFileTour says so
    }
    this.tour = !rel ? buildRepoTour(index, this.level) : isDir ? buildFolderTour(index, rel, this.level) : buildFileTour(index, rel, this.level);
    await this.render();
    if (this.tour.message) {
      this.panda.say(this.tour.message, "talk", 7000);
      void vscode.window.showInformationMessage(`Mentor: ${this.tour.message}`);
      return;
    }
    await this.walk(0);
  }

  /** Board buttons and links. */
  async onAction(a: RepoAction): Promise<void> {
    switch (a.type) {
      case "tourStart":
        return this.tour && this.tour.kind !== "repo" ? this.walk(0) : this.start(0);
      case "tourResume":
        return this.start(this.saved()?.at ?? 0);
      case "tourJump":
        return this.panda.tourTag === TAG ? this.panda.goTo(a.stop) : this.walk(a.stop);
      case "tourNext":
        return this.panda.tourTag === TAG ? this.panda.next() : this.walk(this.at + 1);
      case "tourBack":
        return this.panda.tourTag === TAG ? this.panda.back() : this.walk(Math.max(0, this.at - 1));
      case "tourEnd":
        if (this.panda.tourTag === TAG) this.panda.dismiss();
        return;
      case "tourLevel":
        await vscode.workspace.getConfiguration("seniorDevMentor").update("tourLevel", a.level, vscode.ConfigurationTarget.Global);
        return this.relevel();
      case "explainPath": {
        if (!this.indexRoot) return;
        return this.explain(vscode.Uri.file(path.join(this.indexRoot, ...a.path.split("/"))));
      }
      case "repoMap":
        return this.open();
      case "aiTour":
        return this.writeWithAi();
      case "aiCancel":
        this.aiAbort?.abort();
        return;
      case "aiBasic":
        if (this.index) this.tour = buildRepoTour(this.index, this.level);
        return this.render();
      case "goal":
        this.goal = a.goal;
        if (a.goal === "deploy") return this.showDeploy();
        if (a.goal === "tour" && this.index && this.tour?.kind !== "repo") this.tour = (await this.savedAiTour()) ?? buildRepoTour(this.index, this.level);
        return this.render();
      case "traceRun":
        return this.trace(a.question, a.start, a.ai);
      case "changeRun":
        return this.change(a.task, a.ai);
      case "deployTarget":
        this.deployTarget = a.id;
        if (this.deploy) this.deploy = { ...deployReport(this.index!, this.texts, a.id).report, explained: undefined };
        return this.showDeploy(false);
      case "deployExplain":
        return this.explainDeploy();
      case "openFile": {
        if (!this.indexRoot) return;
        // "Show me" never opens a file that may hold secrets, even if asked to.
        if (isSecretPath(a.path)) return;
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(this.indexRoot, ...a.path.split("/"))));
        const pos = new vscode.Position(a.line ?? 0, 0);
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, selection: new vscode.Range(pos, pos) });
        return;
      }
    }
  }

  /** The panda reached a stop (or left its tour). */
  pandaMoved(where: PandaWhereabouts | null): void {
    if (where && where.tag === TAG) {
      this.at = where.stop - 1;
      this.board.update({ type: "tourAt", stop: this.at });
      if (this.tour?.kind === "repo") void this.ctx.workspaceState.update(PROGRESS_KEY, { at: this.at, stops: where.stops } satisfies SavedProgress);
    } else if (this.at >= 0 && this.panda.tourTag !== TAG) {
      this.at = -1;
      this.board.update({ type: "tourAt", stop: -1 });
    }
  }

  // -------------------------------------------------------------- inner workings

  private get level(): Level {
    return vscode.workspace.getConfiguration("seniorDevMentor").get<Level>("tourLevel", "new") === "experienced" ? "experienced" : "new";
  }

  private saved(): SavedProgress | undefined {
    return this.ctx.workspaceState.get<SavedProgress>(PROGRESS_KEY);
  }

  private async relevel(): Promise<void> {
    if (!this.index || !this.tour) return this.open();
    if (this.goal === "deploy") return this.showDeploy(false);
    if (this.tour.kind === "trace" && this.question) return this.trace(this.question, undefined, false);
    if (this.tour.kind === "change" && this.task) return this.change(this.task, false);
    const wasAt = this.panda.tourTag === TAG ? this.at : -1;
    const kind = this.tour.kind;
    const rel = kind === "repo" ? "" : flatStops(this.tour)[0]?.path;
    this.tour =
      kind === "repo" || !rel
        ? ((await this.savedAiTour()) ?? buildRepoTour(this.index, this.level))
        : kind === "file"
          ? buildFileTour(this.index, rel, this.level)
          : buildFolderTour(this.index, rel.split("/").slice(0, -1).join("/"), this.level);
    await this.render();
    if (wasAt >= 0) await this.walk(Math.min(wasAt, flatStops(this.tour).length - 1));
  }

  private async walk(at: number): Promise<void> {
    if (!this.tour || !this.indexRoot) return;
    const stops = flatStops(this.tour).slice(0, MAX_STOPS);
    if (!stops.length || at >= stops.length) return;
    const root = this.indexRoot;
    const uri = (p: string) => vscode.Uri.file(path.join(root, ...p.split("/")));
    const went = await this.panda.tour(
      uri(stops[0].path),
      stops.map((s) => ({ uri: uri(s.path), line: s.line, note: s.note, bubble: s.bubble })),
      { reveal: true, viewColumn: vscode.ViewColumn.One, max: MAX_STOPS, tag: TAG, startAt: at },
    );
    if (!went) {
      const why = this.panda.enabled ? "I couldn't open that file." : "The panda is turned off (setting `seniorDevMentor.mascot`), so I can't walk you through the files.";
      void vscode.window.showInformationMessage(`Mentor: ${why}`);
    }
  }

  private async render(): Promise<void> {
    if (!this.index || !this.tour) return;
    if (this.goal === "deploy" && this.deploy) return this.showDeploy(false);
    const saved = this.saved();
    const total = flatStops(this.tour).length;
    this.board.show({
      type: "repo",
      repo: repoView(this.index),
      tour: tourView(this.tour),
      level: this.level,
      at: this.panda.tourTag === TAG ? this.at : -1,
      resumeAt: this.tour.kind === "repo" && saved && saved.at > 0 && saved.at < total && saved.stops === total ? saved.at : undefined,
      ai: ["repo", "trace", "change"].includes(this.tour.kind) ? await this.aiPanel() : undefined,
      goal: this.goal,
      suggestions: traceStarts(this.index, "", this.texts).map((s) => s.label),
      question: this.question,
      task: this.task,
    });
  }

  // -------------------------------------------------------------- follow a request, make a change

  /** "What happens when…": the no-AI trace, or (with `ai`) one written by the model and checked. */
  async trace(question: string, startIndex?: number, ai = false): Promise<void> {
    const index = await this.load();
    if (!index) return;
    this.goal = "trace";
    this.question = question.trim();
    const starts = traceStarts(index, this.question, this.texts);
    const all = traceStarts(index, "", this.texts);
    const start = startIndex !== undefined ? all[startIndex] : starts[0];
    const { steps, sequence } = start ? buildTrace(index, this.texts, start, this.question || start.label) : { steps: [], sequence: { question: this.question, actors: [], messages: [] } };
    this.tour = traceTour(this.question || start?.label || "", steps, sequence, this.level);
    if (ai) {
      const done = await this.withAi("trace", async (setup, signal) =>
        writeAiTrace({ index, texts: this.texts, provider: await setup.provider(), level: this.level, question: this.question || start?.label || "", start, steps, never: this.never, guard: setup.guard, signal }),
      );
      if (!done) return;
      this.tour = done;
    }
    this.onEvent?.("traced", `${this.question || start?.label}${ai ? " (with AI)" : ""}: ${flatStops(this.tour).map((s) => s.path).join(" → ")}`);
    await this.render();
    if (flatStops(this.tour).length) await this.walk(0);
  }

  /** "I need to change…": where the change goes, what else it touches, which tests to run. */
  async change(task: string, ai = false): Promise<void> {
    const index = await this.load();
    if (!index) return;
    this.goal = "change";
    this.task = task.trim();
    this.tour = buildChangeTour(index, this.texts, this.task, this.level);
    if (ai && this.task) {
      const candidates = changeCandidates(index, this.texts, this.task).map((c) => c.path);
      const done = await this.withAi("change", async (setup, signal) => {
        const cacheFile = vscode.Uri.joinPath(this.ctx.globalStorageUri, "repo-summaries", `${createHash("sha1").update(this.indexRoot!).digest("hex").slice(0, 16)}.json`).fsPath;
        const r = await writeAiTour({
          index,
          texts: this.texts,
          provider: await setup.provider(),
          model: setup.model,
          level: this.level,
          budget: "small",
          never: this.never,
          cache: new SummaryCache(cacheFile),
          guard: setup.guard,
          signal,
          goal: { kind: "change", task: this.task, candidates },
          onProgress: (text) => this.board.update({ type: "aiProgress", text }),
        });
        return r.tour;
      });
      if (!done) return;
      this.tour = done;
    }
    this.onEvent?.("change planned", `${this.task}${ai ? " (with AI)" : ""}: ${flatStops(this.tour).map((s) => s.path).join(", ") || "nothing found"}`);
    await this.render();
    if (flatStops(this.tour).length) await this.walk(0);
  }

  /** Runs an AI step with the same consent, progress and error handling as the AI tour. */
  private async withAi<T>(what: string, run: (setup: AiSetup, signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    if (!this.aiSetup || this.aiAbort) return undefined;
    const setup = await this.aiSetup();
    if (!setup.ready) {
      this.aiStatus = { state: "error", text: "Add an Anthropic API key first, or switch to a free local model (Ollama) in settings.", action: "setApiKey" };
      await this.render();
      return undefined;
    }
    const abort = (this.aiAbort = new AbortController());
    this.aiStatus = { state: "working", text: what === "trace" ? "Following the code…" : what === "deploy" ? "Writing your deploy guide…" : "Finding where your change goes…" };
    await this.render();
    this.panda.think(true);
    try {
      const out = await run(setup, abort.signal);
      this.aiStatus = { state: "idle" };
      return out;
    } catch (e) {
      this.aiStatus = abort.signal.aborted ? { state: "idle" } : { state: "error", text: e instanceof Error ? e.message : String(e), action: e instanceof ProviderError ? e.action : undefined };
      await this.render();
      return undefined;
    } finally {
      this.aiAbort = undefined;
      this.panda.think(false);
    }
  }

  // -------------------------------------------------------------- deploy

  /** "How do I deploy this?": the checks, where it can go, and the steps. */
  async showDeploy(rebuild = true): Promise<void> {
    const index = await this.load();
    if (!index) return;
    this.goal = "deploy";
    if (rebuild || !this.deploy) {
      this.deploy = deployReport(index, this.texts, this.deployTarget).report;
      const s = this.deploy.score;
      this.onEvent?.("deploy check", `${this.deploy.app.words}: ${s.pass} ready, ${s.warn} to look at, ${s.fail} to fix before deploying`);
    }
    const setup = this.aiSetup ? await this.aiSetup() : undefined;
    this.board.show({
      type: "deploy",
      report: this.deploy,
      level: this.level,
      ai: setup && { kind: setup.kind, label: setup.label, ready: setup.ready, state: this.aiStatus.state, text: this.aiStatus.text, action: this.aiStatus.action },
    });
  }

  private async explainDeploy(): Promise<void> {
    if (!this.index || !this.deploy) return;
    const index = this.index;
    const report = this.deploy;
    const out = await this.withAi("deploy", async (setup, signal) =>
      explainDeploy({ index, texts: this.texts, report, provider: await setup.provider(), level: this.level, guard: setup.guard, signal, never: this.never }),
    );
    if (out && this.deploy === report) this.deploy = { ...report, explained: out };
    await this.showDeploy(false);
  }

  // -------------------------------------------------------------- the AI tour

  private get budget(): Budget {
    const b = vscode.workspace.getConfiguration("seniorDevMentor").get<string>("tourBudget", "medium");
    return b in BUDGETS ? (b as Budget) : "medium";
  }

  /** What the consent card says: which model, how many files, about how many tokens and dollars. */
  private async aiPanel(): Promise<AiPanel | undefined> {
    if (!this.index || !this.aiSetup) return undefined;
    const setup = await this.aiSetup();
    const plan = planSend(this.index, this.texts, this.budget, this.never);
    return {
      kind: setup.kind,
      label: setup.label,
      ready: setup.ready,
      files: plan.files,
      tokens: plan.inputTokens,
      cost: setup.kind === "anthropic" ? estimateCost(setup.model, plan.inputTokens, plan.outputTokens) : undefined,
      budget: this.budget,
      state: this.aiStatus.state,
      text: this.aiStatus.text,
      action: this.aiStatus.action,
      written: !!this.tour?.ai,
    };
  }

  private async aiKey(level: Level, model: string): Promise<string | undefined> {
    if (!this.index) return undefined;
    return createHash("sha1").update(`${PROMPT_VERSION}\0${level}\0${model}\0${this.budget}\0${indexDigest(this.index)}`).digest("hex");
  }

  /** An AI tour written earlier for this exact state of the repo, level and model: free to reuse. */
  private async savedAiTour(): Promise<Tour | undefined> {
    if (!this.aiSetup) return undefined;
    const key = await this.aiKey(this.level, (await this.aiSetup()).model);
    const all = this.ctx.workspaceState.get<Record<string, Tour>>(AI_TOURS_KEY) ?? {};
    return key ? all[key] : undefined;
  }

  private async writeWithAi(): Promise<void> {
    if (!this.index || !this.indexRoot || !this.aiSetup || this.aiAbort) return;
    const setup = await this.aiSetup();
    if (!setup.ready) {
      this.aiStatus = { state: "error", text: "Add an Anthropic API key first, or switch to a free local model (Ollama) in settings.", action: "setApiKey" };
      return this.render();
    }
    const abort = (this.aiAbort = new AbortController());
    const index = this.index;
    const level = this.level;
    this.aiStatus = { state: "working", text: "Getting started…" };
    await this.render();
    this.panda.think(true);
    try {
      const cacheFile = vscode.Uri.joinPath(this.ctx.globalStorageUri, "repo-summaries", `${createHash("sha1").update(this.indexRoot).digest("hex").slice(0, 16)}.json`).fsPath;
      const result = await writeAiTour({
        index,
        texts: this.texts,
        provider: await setup.provider(),
        model: setup.model,
        level,
        budget: this.budget,
        never: this.never,
        cache: new SummaryCache(cacheFile),
        guard: setup.guard,
        signal: abort.signal,
        onProgress: (text) => {
          this.aiStatus = { state: "working", text };
          this.board.update({ type: "aiProgress", text });
        },
      });
      const key = await this.aiKey(level, setup.model);
      if (key) {
        // Keep the last few, so switching levels back and forth doesn't pay twice.
        const all = this.ctx.workspaceState.get<Record<string, Tour>>(AI_TOURS_KEY) ?? {};
        const kept = Object.fromEntries([...Object.entries(all).filter(([k]) => k !== key).slice(-3), [key, result.tour]]);
        await this.ctx.workspaceState.update(AI_TOURS_KEY, kept);
      }
      this.aiStatus = { state: "idle" };
      if (this.index === index && this.level === level) {
        this.tour = result.tour;
        await this.render();
        await this.walk(0);
      }
    } catch (e) {
      const cancelled = abort.signal.aborted;
      this.aiStatus = cancelled
        ? { state: "idle" }
        : { state: "error", text: e instanceof ProviderError || e instanceof Error ? e.message : String(e), action: e instanceof ProviderError ? e.action : undefined };
      await this.render();
    } finally {
      this.aiAbort = undefined;
      this.panda.think(false);
    }
  }

  /** The workspace folder to read: the one holding `uri` (or the open file), else the first. */
  private rootFor(uri?: vscode.Uri): string | undefined {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    const folder = (target && vscode.workspace.getWorkspaceFolder(target)) ?? folders[0];
    return folder?.uri.scheme === "file" ? folder.uri.fsPath : undefined;
  }

  private async load(uri?: vscode.Uri): Promise<RepoIndex | undefined> {
    const root = this.rootFor(uri);
    if (!root) {
      void vscode.window.showInformationMessage("Mentor: open a folder (File → Open Folder…) and I'll show you around it.");
      return undefined;
    }
    if (this.index && this.indexRoot === root && !this.stale) return this.index;
    if (this.building) return this.building;
    this.board.show({ type: "loading", text: `Reading ${path.basename(root)}…` });
    const cfg = vscode.workspace.getConfiguration("seniorDevMentor");
    this.building = (async () => {
      try {
        try {
          const match = gitignore(await fs.readFile(path.join(root, ".mentorignore"), "utf8"));
          this.never = (p) => p.split("/").some((_, i, parts) => match(parts.slice(0, i + 1).join("/"), i < parts.length - 1));
        } catch {
          this.never = () => false;
        }
        const [walked, changes] = await Promise.all([
          walkRepo(root, { maxFiles: cfg.get<number>("tourMaxFiles", 20000) }),
          cfg.get<boolean>("useGitHistory", true) ? recentChanges(root) : Promise.resolve(new Map<string, number>()),
        ]);
        this.stale = false;
        this.indexRoot = root;
        this.texts = new Map(walked.files.map((f) => [f.path, f.text]));
        this.index = buildIndex(walked.files, { rootName: path.basename(root), changes, totalFiles: walked.totalFiles, truncated: walked.truncated });
        return this.index;
      } catch (e) {
        this.board.show({ type: "error", message: `I couldn't read this folder: ${(e as Error).message}` });
        return undefined;
      } finally {
        this.building = undefined;
      }
    })();
    return this.building;
  }

  /** Once per workspace, in a project of some size, the panda offers a tour. */
  private async maybeOffer(): Promise<void> {
    if (!vscode.workspace.getConfiguration("seniorDevMentor").get<boolean>("offerTourOnOpen", true)) return;
    if (!this.rootFor() || this.ctx.workspaceState.get<boolean>(OFFERED_KEY)) return;
    const found = await vscode.workspace.findFiles(
      "**/*.{py,js,jsx,ts,tsx,go,java,kt,rs,rb,php,cs,cpp,c,swift,dart}",
      "**/{node_modules,dist,build,out,.venv,venv,target,vendor,.git}/**",
      20,
    );
    if (found.length < 20) return;
    await this.ctx.workspaceState.update(OFFERED_KEY, true);
    this.panda.say("New project? Click the compass in the Mentor panel and I'll show you around.", "talk", 10000);
  }
}
