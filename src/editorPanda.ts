import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { placePanda, pandaCss, bubbleCss } from "./pandaPlacement";

// The panda lives in the code editor. VS Code has no API for drawing over
// code, so, like Power Mode and similar extensions, we inject CSS through an
// editor decoration: an empty `before` box at the end of a line becomes the
// panda (a sprite as background image) and an `after` box becomes its speech
// bubble. Both are positioned relative to the end of that line's text.
// Moving the decoration line by line, swapping sprites each tick, makes it walk.

export interface PandaStop {
  line: number; // 0-based
  note: string; // Markdown, already guarded
}

export interface PandaWhereabouts {
  fileName: string;
  line: number; // 1-based
  stop: number;
  stops: number;
}

type Pose = "sit" | "walk1" | "walk2" | "sleep" | "think" | "talk" | "cheer";
const POSES: Pose[] = ["sit", "walk1", "walk2", "sleep", "think", "talk", "cheer"];

const TICK_MS = 70;
const MAX_WALK_TICKS = 22;
const FOLLOW_DELAY_MS = 1400;
const SLEEP_AFTER_MS = 90_000;

// ---------------------------------------------------------------- the panda

export class EditorPanda implements vscode.Disposable {
  private readonly sprites: Record<Pose, string>;
  private readonly overlay: vscode.TextEditorDecorationType;
  private readonly spot: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  private editor?: vscode.TextEditor;
  private line?: number; // where the panda is drawn
  private pose: Pose = "sit";
  private bubble?: string;
  private hidden = false;
  private busy = false; // mentor is thinking
  private stops: PandaStop[] = [];
  private index = 0;
  private touring = false;
  private walkToken = 0;
  private followTimer?: NodeJS.Timeout;
  private sleepTimer?: NodeJS.Timeout;
  private bubbleTimer?: NodeJS.Timeout;

  constructor(
    extensionUri: vscode.Uri,
    private readonly onMove: (where: PandaWhereabouts | null) => void,
  ) {
    const dir = path.join(extensionUri.fsPath, "media", "panda");
    this.sprites = Object.fromEntries(
      POSES.map((p) => [p, `data:image/svg+xml;base64,${fs.readFileSync(path.join(dir, `${p}.svg`)).toString("base64")}`]),
    ) as Record<Pose, string>;
    this.overlay = vscode.window.createTextEditorDecorationType({});
    this.spot = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor("editor.wordHighlightStrongBackground"),
      overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.warningForeground"),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => this.onEditor(e)),
      vscode.window.onDidChangeTextEditorSelection((e) => this.onCursor(e)),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (e.textEditor === this.editor) this.draw();
      }),
      vscode.workspace.onDidChangeTextDocument((e) => this.onEdit(e)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("seniorDevMentor.mascot")) this.enabled ? this.onEditor(vscode.window.activeTextEditor) : this.clearAll();
      }),
    );
    this.onEditor(vscode.window.activeTextEditor);
  }

  get enabled(): boolean {
    return vscode.workspace.getConfiguration("seniorDevMentor").get<boolean>("mascot", true);
  }

  /** True while the panda is at a stop the mentor sent it to. */
  get active(): boolean {
    return this.touring;
  }

  get current(): PandaStop | undefined {
    return this.touring ? this.stops[this.index] : undefined;
  }

  get atLine(): number | undefined {
    return this.line;
  }

  get currentPose(): string {
    return this.pose;
  }

  /** True while the panda is presenting on its board instead of sitting in the editor. */
  get isOut(): boolean {
    return this.hidden;
  }

  // -------------------------------------------------------------- things the mentor asks for

  /** Show thinking dots while the mentor works on an answer. */
  think(on: boolean): void {
    this.busy = on;
    if (this.touring) return;
    this.setPose(on ? "think" : "sit");
    this.wake();
  }

  /** A short reaction in a bubble where the panda is. */
  say(text: string, pose: Pose = "talk", ms = 5000): void {
    if (!this.editor || this.touring || this.hidden) return;
    this.bubble = clip(text, 160);
    this.pose = pose;
    this.draw();
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => {
      this.bubble = undefined;
      this.pose = this.busy ? "think" : "sit";
      this.draw();
    }, ms);
    this.wake();
  }

  /** Walk off the edge (to present on the board). */
  async stepOut(): Promise<void> {
    if (!this.editor || this.hidden) return;
    this.endTour(false);
    this.bubble = undefined;
    this.hidden = true;
    this.draw();
  }

  /** Come back into the editor next to the cursor. */
  stepIn(): void {
    if (!this.hidden) return;
    this.hidden = false;
    this.line = this.editor?.selection.active.line;
    this.setPose("cheer");
    setTimeout(() => this.pose === "cheer" && this.setPose("sit"), 1500);
  }

  /**
   * Walk to each stop in turn (the first one now, the rest on "Next stop").
   * With `reveal: false` the panda only goes if the line is already on screen,
   * so it never scrolls the editor out from under someone who is typing.
   */
  async tour(uri: vscode.Uri, stops: PandaStop[], opts: { reveal: boolean; viewColumn?: vscode.ViewColumn }): Promise<boolean> {
    if (!stops.length || !this.enabled) return false;
    const editor = await this.editorFor(uri, opts.reveal, opts.viewColumn);
    if (!editor) return false;
    const target = Math.min(stops[0].line, editor.document.lineCount - 1);
    if (!opts.reveal && !isVisible(editor, target)) return false;
    this.hidden = false;
    this.adopt(editor);
    this.stops = stops.slice(0, 8);
    this.index = 0;
    this.touring = true;
    await this.goToStop(0, opts.reveal);
    return true;
  }

  async next(): Promise<void> {
    if (!this.touring || this.index + 1 >= this.stops.length || !this.editor) return this.dismiss();
    await this.goToStop(this.index + 1, true);
  }

  dismiss(): void {
    if (!this.touring) return;
    this.endTour(true);
  }

  dispose(): void {
    this.clearAll();
    clearTimeout(this.followTimer);
    clearTimeout(this.sleepTimer);
    clearTimeout(this.bubbleTimer);
    this.overlay.dispose();
    this.spot.dispose();
    this.disposables.forEach((d) => d.dispose());
  }

  // -------------------------------------------------------------- walking

  private async goToStop(index: number, reveal: boolean): Promise<void> {
    const editor = this.editor!;
    const stop = this.stops[index];
    const target = Math.max(0, Math.min(stop.line, editor.document.lineCount - 1));
    this.index = index;
    this.bubble = undefined;
    editor.setDecorations(this.spot, []);
    if (reveal && !isVisible(editor, target)) {
      editor.revealRange(new vscode.Range(target, 0, target, 0), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      await sleep(150);
    }
    if (!(await this.walkTo(target))) return;
    this.pose = "talk";
    this.bubble = clip(plain(stop.note, 150), 160) + (this.stops.length > 1 ? `  (${index + 1}/${this.stops.length}, hover the line)` : "  (hover the line)");
    this.draw();
    this.showSpot(target);
    this.onMove({ fileName: path.basename(editor.document.fileName), line: target + 1, stop: index + 1, stops: this.stops.length });
  }

  /** Walk line by line. Returns false if a newer walk took over. */
  private async walkTo(target: number): Promise<boolean> {
    const editor = this.editor!;
    const token = ++this.walkToken;
    const visibleTop = editor.visibleRanges[0]?.start.line ?? 0;
    let line = this.line ?? Math.max(visibleTop, Math.min(target, editor.selection.active.line));
    if (!isVisible(editor, line)) line = Math.max(visibleTop, Math.min(target, editor.visibleRanges[0]?.end.line ?? target));
    const dist = target - line;
    const stride = Math.max(1, Math.ceil(Math.abs(dist) / MAX_WALK_TICKS));
    let frame = 0;
    this.bubble = undefined;
    while (line !== target) {
      if (token !== this.walkToken) return false;
      line = dist > 0 ? Math.min(target, line + stride) : Math.max(target, line - stride);
      this.line = line;
      this.pose = frame++ % 2 ? "walk2" : "walk1";
      this.draw();
      await sleep(TICK_MS);
    }
    if (token !== this.walkToken) return false;
    this.line = target;
    this.pose = "sit";
    this.draw();
    return true;
  }

  private endTour(notify: boolean): void {
    this.walkToken++;
    this.touring = false;
    this.stops = [];
    this.bubble = undefined;
    this.editor?.setDecorations(this.spot, []);
    this.pose = this.busy ? "think" : "cheer";
    this.draw();
    if (this.pose === "cheer") setTimeout(() => this.pose === "cheer" && this.setPose("sit"), 1500);
    if (notify) this.onMove(null);
  }

  private showSpot(line: number): void {
    const editor = this.editor!;
    const stop = this.stops[this.index];
    const more = this.index + 1 < this.stops.length;
    const hover = new vscode.MarkdownString(undefined, true);
    hover.isTrusted = { enabledCommands: ["seniorDevMentor.pandaAsk", "seniorDevMentor.pandaNext", "seniorDevMentor.pandaDismiss"] };
    hover.appendMarkdown(`$(lightbulb) **Mentor** · line ${line + 1}${this.stops.length > 1 ? ` · stop ${this.index + 1} of ${this.stops.length}` : ""}\n\n`);
    hover.appendMarkdown(`${stop.note}\n\n---\n\n`);
    hover.appendMarkdown(`[$(comment-discussion) Explain more](command:seniorDevMentor.pandaAsk "Ask the mentor about this line")`);
    if (more) hover.appendMarkdown(` · [$(arrow-down) Next stop](command:seniorDevMentor.pandaNext "Walk to the next line")`);
    hover.appendMarkdown(` · [$(check) Got it](command:seniorDevMentor.pandaDismiss "Thanks, panda")`);
    editor.setDecorations(this.spot, [{ range: editor.document.lineAt(line).range, hoverMessage: hover }]);
  }

  // -------------------------------------------------------------- everyday life: follow, sleep, wake

  private onEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor || !this.enabled || editor.document.uri.scheme === "output") return;
    if (editor === this.editor) return;
    if (this.touring) this.endTour(true);
    this.adopt(editor);
    this.line = editor.selection.active.line;
    this.draw();
    this.wake();
  }

  private adopt(editor: vscode.TextEditor): void {
    if (this.editor && this.editor !== editor) {
      this.editor.setDecorations(this.overlay, []);
      this.editor.setDecorations(this.spot, []);
    }
    this.editor = editor;
  }

  private onCursor(e: vscode.TextEditorSelectionChangeEvent): void {
    if (e.textEditor !== this.editor || !this.enabled) return;
    this.wake();
    if (this.touring || this.hidden) return;
    if (!vscode.workspace.getConfiguration("seniorDevMentor").get<boolean>("pandaFollowsCursor", true)) return;
    // After you pause, the panda strolls over to the line you're on.
    clearTimeout(this.followTimer);
    this.followTimer = setTimeout(() => {
      const target = this.editor?.selection.active.line;
      if (target === undefined || target === this.line || this.touring || this.hidden) return;
      void this.walkTo(target).then((done) => done && this.busy && this.setPose("think"));
    }, FOLLOW_DELAY_MS);
  }

  private onEdit(e: vscode.TextDocumentChangeEvent): void {
    if (!this.editor || e.document !== this.editor.document) return;
    this.wake();
    // Editing the line the panda points at means it has done its job.
    if (this.touring && this.current) {
      const line = this.line ?? -1;
      if (e.contentChanges.some((c) => c.range.start.line <= line && c.range.end.line >= line)) this.endTour(true);
      return;
    }
    this.draw(); // line lengths changed: keep the panda clear of the code
  }

  private wake(): void {
    if (this.pose === "sleep") this.setPose(this.busy ? "think" : "sit");
    clearTimeout(this.sleepTimer);
    this.sleepTimer = setTimeout(() => {
      if (!this.touring && !this.busy && !this.bubble) this.setPose("sleep");
    }, SLEEP_AFTER_MS);
  }

  // -------------------------------------------------------------- drawing

  private setPose(pose: Pose): void {
    this.pose = pose;
    this.draw();
  }

  private draw(): void {
    const editor = this.editor;
    if (!editor) return;
    if (!this.enabled || this.hidden || this.line === undefined || editor.document.isClosed) {
      editor.setDecorations(this.overlay, []);
      return;
    }
    const doc = editor.document;
    const line = Math.min(this.line, doc.lineCount - 1);
    const lines: string[] = [];
    for (let i = Math.max(0, line - 3); i <= Math.min(doc.lineCount - 1, line + 2); i++) lines[i] = doc.lineAt(i).text;
    const tabSize = typeof editor.options.tabSize === "number" ? editor.options.tabSize : 4;
    const place = placePanda(lines, line, editor.visibleRanges[0]?.start.line ?? 0, tabSize);
    const end = doc.lineAt(line).range.end;
    editor.setDecorations(this.overlay, [
      {
        range: new vscode.Range(end, end),
        renderOptions: {
          before: { contentText: "", textDecoration: pandaCss(this.sprites[this.pose], place.offsetCh) },
          after: this.bubble ? { contentText: this.bubble, textDecoration: bubbleCss(place) } : undefined,
        },
      },
    ]);
  }

  private clearAll(): void {
    this.walkToken++;
    for (const e of vscode.window.visibleTextEditors) {
      e.setDecorations(this.overlay, []);
      e.setDecorations(this.spot, []);
    }
  }

  private async editorFor(uri: vscode.Uri, open: boolean, viewColumn?: vscode.ViewColumn): Promise<vscode.TextEditor | undefined> {
    const visible = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
    if (visible || !open) return visible;
    try {
      return await vscode.window.showTextDocument(uri, { viewColumn, preserveFocus: true, preview: false });
    } catch {
      return undefined;
    }
  }
}

/** First sentence of a note as plain text, short enough for a bubble. */
export function plain(md: string, max = 80): string {
  const text = md
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g, "$1$2$3")
    .replace(/\s+/g, " ")
    .trim();
  const first = text.match(/^.+?[.?!](?=\s|$)/)?.[0] ?? text;
  return clip(first, max);
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const isVisible = (e: vscode.TextEditor, line: number) => e.visibleRanges.some((r) => r.start.line <= line && r.end.line >= line);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
