import * as vscode from "vscode";
import * as path from "path";

// The panda can leave the sidebar and walk down the editor gutter to a line,
// then sit there with a short note beside the code. Hovering the line shows
// the full explanation with buttons. Walking is a sequence of gutter-icon
// decorations, swapped every tick like frames of a flipbook.

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

const TICK_MS = 55;
const MAX_TICKS = 26;

export class EditorPanda implements vscode.Disposable {
  private readonly walk: [vscode.TextEditorDecorationType, vscode.TextEditorDecorationType];
  private readonly sit: vscode.TextEditorDecorationType;
  private readonly spot: vscode.TextEditorDecorationType;
  private readonly note: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  private uri?: vscode.Uri;
  private stops: PandaStop[] = [];
  private index = 0;
  private at?: number; // line the panda is on now
  private walkToken = 0;

  constructor(
    extensionUri: vscode.Uri,
    private readonly onMove: (where: PandaWhereabouts | null) => void,
  ) {
    const icon = (f: string) => vscode.Uri.joinPath(extensionUri, "media", "panda", f);
    const gutter = (f: string) => vscode.window.createTextEditorDecorationType({ gutterIconPath: icon(f), gutterIconSize: "contain" });
    this.walk = [gutter("walk1.svg"), gutter("walk2.svg")];
    this.sit = gutter("sit.svg");
    this.spot = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor("editor.wordHighlightStrongBackground"),
      overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.warningForeground"),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
    this.note = vscode.window.createTextEditorDecorationType({
      after: { margin: "0 0 0 2.5em", color: new vscode.ThemeColor("editorCodeLens.foreground"), fontStyle: "italic" },
    });

    this.disposables.push(
      // When the student edits the line the panda is pointing at, it has done its job.
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!this.uri || e.document.uri.toString() !== this.uri.toString() || this.at === undefined) return;
        const line = this.at;
        if (e.contentChanges.some((c) => c.range.start.line <= line && c.range.end.line >= line)) this.dismiss();
      }),
      vscode.workspace.onDidCloseTextDocument((d) => {
        if (this.uri && d.uri.toString() === this.uri.toString()) this.dismiss();
      }),
    );
  }

  get active(): boolean {
    return this.at !== undefined;
  }

  get current(): PandaStop | undefined {
    return this.active ? this.stops[this.index] : undefined;
  }

  /**
   * Walk to each stop in turn (the first one now, the rest on "Next stop").
   * With `reveal: false` the panda only goes if the line is already on screen,
   * so it never scrolls the editor out from under someone who is typing.
   */
  async tour(uri: vscode.Uri, stops: PandaStop[], opts: { reveal: boolean; viewColumn?: vscode.ViewColumn }): Promise<boolean> {
    if (!stops.length) return false;
    const editor = await this.editorFor(uri, opts.reveal, opts.viewColumn);
    if (!editor) return false;
    const target = Math.min(stops[0].line, editor.document.lineCount - 1);
    if (!opts.reveal && !editor.visibleRanges.some((r) => r.start.line <= target && r.end.line >= target)) return false;
    if (this.uri && this.uri.toString() !== uri.toString()) this.clear();
    this.uri = uri;
    this.stops = stops.slice(0, 8);
    this.index = 0;
    await this.goTo(editor, 0, opts.reveal);
    return true;
  }

  async next(): Promise<void> {
    if (!this.uri || this.index + 1 >= this.stops.length) return this.dismiss();
    const editor = await this.editorFor(this.uri, true);
    if (editor) await this.goTo(editor, this.index + 1, true);
  }

  dismiss(): void {
    if (!this.active) return;
    this.clear();
    this.onMove(null);
  }

  dispose(): void {
    this.clear();
    [...this.walk, this.sit, this.spot, this.note].forEach((d) => d.dispose());
    this.disposables.forEach((d) => d.dispose());
  }

  private async goTo(editor: vscode.TextEditor, index: number, reveal: boolean): Promise<void> {
    const token = ++this.walkToken;
    const doc = editor.document;
    const target = Math.max(0, Math.min(this.stops[index].line, doc.lineCount - 1));
    this.index = index;
    this.clearDecorations(editor);

    const targetRange = new vscode.Range(target, 0, target, 0);
    if (reveal) {
      editor.revealRange(targetRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      await sleep(120);
    }
    // Walk from where the panda is, or from the top of the screen.
    const visibleTop = editor.visibleRanges[0]?.start.line ?? 0;
    const start = this.at ?? Math.max(0, Math.min(visibleTop, doc.lineCount - 1));
    const dist = target - start;
    const stride = Math.max(1, Math.ceil(Math.abs(dist) / MAX_TICKS));
    let line = start;
    let frame = 0;
    while (line !== target) {
      if (token !== this.walkToken) return; // a newer walk took over
      line = dist > 0 ? Math.min(target, line + stride) : Math.max(target, line - stride);
      const r = new vscode.Range(line, 0, line, 0);
      editor.setDecorations(this.walk[frame], [r]);
      editor.setDecorations(this.walk[1 - frame], []);
      frame = 1 - frame;
      await sleep(TICK_MS);
    }
    if (token !== this.walkToken) return;
    this.walk.forEach((w) => editor.setDecorations(w, []));
    this.at = target;
    this.arrive(editor, target);
    this.onMove({ fileName: path.basename(doc.fileName), line: target + 1, stop: index + 1, stops: this.stops.length });
  }

  private arrive(editor: vscode.TextEditor, line: number): void {
    const stop = this.stops[this.index];
    const lineRange = editor.document.lineAt(line).range;
    const short = plain(stop.note);
    const more = this.index + 1 < this.stops.length;

    const hover = new vscode.MarkdownString(undefined, true);
    hover.isTrusted = { enabledCommands: ["seniorDevMentor.pandaAsk", "seniorDevMentor.pandaNext", "seniorDevMentor.pandaDismiss"] };
    hover.appendMarkdown(`$(lightbulb) **Mentor** · line ${line + 1}${this.stops.length > 1 ? ` · stop ${this.index + 1} of ${this.stops.length}` : ""}\n\n`);
    hover.appendMarkdown(`${stop.note}\n\n---\n\n`);
    hover.appendMarkdown(`[$(comment-discussion) Explain more](command:seniorDevMentor.pandaAsk "Ask the mentor about this line")`);
    if (more) hover.appendMarkdown(` · [$(arrow-down) Next stop](command:seniorDevMentor.pandaNext "Walk to the next line")`);
    hover.appendMarkdown(` · [$(check) Got it](command:seniorDevMentor.pandaDismiss "Send the panda back to the sidebar")`);

    editor.setDecorations(this.sit, [new vscode.Range(line, 0, line, 0)]);
    editor.setDecorations(this.spot, [{ range: lineRange, hoverMessage: hover }]);
    editor.setDecorations(this.note, [
      {
        range: new vscode.Range(line, lineRange.end.character, line, lineRange.end.character),
        renderOptions: { after: { contentText: `← ${short}${more ? "  (hover for more)" : "  (hover me)"}` } },
      },
    ]);
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

  private clearDecorations(editor: vscode.TextEditor): void {
    [...this.walk, this.sit, this.spot, this.note].forEach((d) => editor.setDecorations(d, []));
  }

  private clear(): void {
    this.walkToken++;
    for (const e of vscode.window.visibleTextEditors) this.clearDecorations(e);
    this.at = undefined;
    this.stops = [];
    this.uri = undefined;
  }
}

/** First sentence of a note as plain text, short enough to sit beside code. */
export function plain(md: string, max = 80): string {
  const text = md
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g, "$1$2$3")
    .replace(/\s+/g, " ")
    .trim();
  const first = text.match(/^.+?[.?!](?=\s|$)/)?.[0] ?? text;
  return first.length > max ? first.slice(0, max - 1) + "…" : first;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
