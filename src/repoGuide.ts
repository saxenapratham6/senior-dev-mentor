// The repo tour: reads the workspace, shows its map on the panda's board,
// and sends the panda from file to file. Nothing here calls an AI model.
import * as vscode from "vscode";
import * as path from "path";
import { walkRepo, recentChanges } from "./repo/walk";
import { buildIndex } from "./repo/index";
import type { RepoIndex } from "./repo/types";
import { buildFileTour, buildFolderTour, buildRepoTour, flatStops, Level, Tour } from "./tour/tour";
import type { EditorPanda, PandaWhereabouts } from "./editorPanda";
import type { PandaBoard, RepoAction } from "./board";
import { repoView, tourView } from "./tour/view";

const PROGRESS_KEY = "seniorDevMentor.repoTour";
const OFFERED_KEY = "seniorDevMentor.tourOffered";
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
  private tour?: Tour;
  private at = -1; // the panda's stop in the current tour, or -1
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

  // -------------------------------------------------------------- commands

  /** Show the repo's map on the board, ready to start the tour. */
  async open(): Promise<void> {
    const index = await this.load();
    if (!index) return;
    this.tour = buildRepoTour(index, this.level);
    this.render();
  }

  /** Start (or resume) the tour of the whole repo. */
  async start(at = 0): Promise<void> {
    const index = await this.load();
    if (!index) return;
    if (this.tour?.kind !== "repo" || this.tour.level !== this.level) this.tour = buildRepoTour(index, this.level);
    this.render(); // the board opens first, so the panda isn't sent off to present on it afterwards
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
    this.render();
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
      case "openFile": {
        if (!this.indexRoot) return;
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
    const wasAt = this.panda.tourTag === TAG ? this.at : -1;
    const kind = this.tour.kind;
    const rel = kind === "repo" ? "" : flatStops(this.tour)[0]?.path;
    this.tour =
      kind === "repo" || !rel
        ? buildRepoTour(this.index, this.level)
        : kind === "file"
          ? buildFileTour(this.index, rel, this.level)
          : buildFolderTour(this.index, rel.split("/").slice(0, -1).join("/"), this.level);
    this.render();
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

  private render(): void {
    if (!this.index || !this.tour) return;
    const saved = this.saved();
    const total = flatStops(this.tour).length;
    this.board.show({
      type: "repo",
      repo: repoView(this.index),
      tour: tourView(this.tour),
      level: this.level,
      at: this.panda.tourTag === TAG ? this.at : -1,
      resumeAt: this.tour.kind === "repo" && saved && saved.at > 0 && saved.at < total && saved.stops === total ? saved.at : undefined,
    });
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
        const [walked, changes] = await Promise.all([
          walkRepo(root, { maxFiles: cfg.get<number>("tourMaxFiles", 20000) }),
          cfg.get<boolean>("useGitHistory", true) ? recentChanges(root) : Promise.resolve(new Map<string, number>()),
        ]);
        this.stale = false;
        this.indexRoot = root;
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
