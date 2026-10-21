import * as vscode from "vscode";
import * as path from "path";
import { classifyRequest, redirectMessage, SolutionGuard, DEFAULT_GUARD } from "./guardrails";
import { HintLadder, hashCode, HINT_LEVELS } from "./hintLadder";
import { actionPreamble, MentorAction, systemPrompt } from "./prompts";
import { codeContext, formatContext, CodeContext } from "./context";
import { ProgressStore, streak } from "./progress";
import { ChatTurn, MentorProvider, ProviderError } from "./providers/types";
import { AnthropicProvider } from "./providers/anthropic";
import { OllamaProvider } from "./providers/ollama";
import { normalizeScene, scenePrompt, SceneSchema, extractLineRefs } from "./scene";
import { EditorPanda, PandaWhereabouts } from "./editorPanda";
import { PandaBoard } from "./board";
import {
  SessionLog,
  newSessionLog,
  isEmptySession,
  sessionStats,
  SummarySchema,
  normalizeSummary,
  summaryPrompt,
  summaryInput,
  summaryMarkdown,
  Summary,
  SessionStats,
} from "./summary";

export const SECRET_KEY = "seniorDevMentor.anthropicApiKey";
const MAX_TURNS = 12;

type FromWebview =
  | { type: "ready" }
  | { type: "ask"; action: MentorAction; text: string }
  | { type: "showMe"; text: string }
  | { type: "wrapUp" }
  | { type: "stop" }
  | { type: "newProblem" }
  | { type: "setApiKey" }
  | { type: "openSettings" }
  | { type: "visitLine"; line: number; note: string };

// Label and Codicon (https://microsoft.github.io/vscode-codicons/) for each action.
const ACTION_LABELS: Record<MentorAction, { text: string; icon: string }> = {
  chat: { text: "", icon: "" },
  review: { text: "Review my attempt", icon: "search" },
  hint: { text: "Hint", icon: "lightbulb" },
  explainError: { text: "Help me understand this error", icon: "bug" },
  checkPlan: { text: "Check my plan", icon: "checklist" },
  quiz: { text: "Quiz me", icon: "question" },
  teach: { text: "Teach me", icon: "book" },
};

// "show me how a stack works", "visualize my loop", "draw a BST" go to the board.
const SHOW_ME = /^\s*(show me|visuali[sz]e|draw|animate|walk me through|let me see)\b/i;

const icon = (name: string) => `<i class="codicon codicon-${name}" aria-hidden="true"></i>`;

export class MentorViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private turns: ChatTurn[] = [];
  private ladder = new HintLadder();
  private redirects = 0;
  private abort?: AbortController;
  private sideAbort?: AbortController; // visualizations and wrap-ups
  private lastEditor?: vscode.TextEditor;
  private replyId = 0;
  private pending: unknown[] = [];
  private session: SessionLog = newSessionLog();
  private lastSummary?: { summary: Summary; stats: SessionStats };
  readonly board: PandaBoard;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly progress: ProgressStore,
    private readonly panda: EditorPanda,
  ) {
    this.lastEditor = vscode.window.activeTextEditor;
    this.board = new PandaBoard(ctx.extensionUri, {
      onOpen: () => void this.panda.stepOut(),
      onClose: () => this.panda.stepIn(),
      onPrediction: (right) => void this.recordPrediction(right),
      onSaveNotes: () => void this.saveNotes(),
      onFix: (action) => void vscode.commands.executeCommand(action === "setApiKey" ? "seniorDevMentor.setApiKey" : "workbench.action.openSettings", action === "setApiKey" ? undefined : "seniorDevMentor"),
      onExample: (name) => this.log("visualized", name, () => this.session.visualized.push(name)),
    });
    ctx.subscriptions.push(
      this.board,
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e && e.document.uri.scheme === "file") {
          this.lastEditor = e;
          const name = path.basename(e.document.fileName);
          if (!this.session.files.includes(name)) this.session.files.push(name);
        }
      }),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const media = vscode.Uri.joinPath(this.ctx.extensionUri, "media");
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    view.webview.html = this.html(view.webview, media);
    view.webview.onDidReceiveMessage((m: FromWebview) => this.onMessage(m), undefined, this.ctx.subscriptions);
    view.onDidDispose(() => (this.view = undefined));
  }

  /** Entry point for editor commands (context menu, palette). */
  async run(action: MentorAction, text = ""): Promise<void> {
    await vscode.commands.executeCommand("seniorDevMentor.view.focus");
    await this.ask(action, text);
  }

  /** A save nudge. `walked` is true when the panda already went to the line in the editor. */
  nudge(question: string, line: number, fileName: string, walked: boolean): void {
    this.log("nudge", `${fileName}:${line + 1} ${question}`);
    if (!walked) this.post({ type: "nudge", question, line, fileName });
  }

  pandaMoved(where: PandaWhereabouts | null): void {
    if (where) this.session.pandaStops++;
  }

  /** Send the panda to lines of the file the student is working on. */
  async visitLines(stops: { line: number; note: string }[]): Promise<boolean> {
    const ed = this.lastEditor;
    if (!ed || ed.document.isClosed) return false;
    return this.panda.tour(ed.document.uri, stops, { reveal: true, viewColumn: ed.viewColumn });
  }

  newProblem(): void {
    this.ladder.reset();
    this.turns = [];
    this.log("newProblem", "");
    this.post({ type: "cleared" });
  }

  refreshConfig(): void {
    void this.sendConfig();
  }

  private post(msg: unknown): void {
    if (this.view) void this.view.webview.postMessage(msg);
    else this.pending.push(msg);
  }

  private log(kind: string, detail: string, also?: () => void): void {
    this.session.events.push({ at: Date.now(), kind, detail });
    also?.();
  }

  private async onMessage(m: FromWebview): Promise<void> {
    switch (m.type) {
      case "ready":
        await this.sendConfig();
        for (const p of this.pending.splice(0)) this.post(p);
        break;
      case "ask":
        if (m.action === "chat" && SHOW_ME.test(m.text)) await this.showMe(m.text);
        else await this.ask(m.action, m.text);
        break;
      case "showMe":
        await this.showMe(m.text);
        break;
      case "wrapUp":
        await this.wrapUp();
        break;
      case "stop":
        this.abort?.abort();
        break;
      case "newProblem":
        this.newProblem();
        break;
      case "setApiKey":
        await vscode.commands.executeCommand("seniorDevMentor.setApiKey");
        break;
      case "openSettings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "seniorDevMentor");
        break;
      case "visitLine":
        if (!(await this.visitLines([{ line: m.line - 1, note: m.note }]))) {
          const ed = this.lastEditor;
          if (ed) {
            const pos = new vscode.Position(Math.max(0, m.line - 1), 0);
            await vscode.window.showTextDocument(ed.document, { viewColumn: ed.viewColumn, selection: new vscode.Range(pos, pos) });
          }
        }
        break;
    }
  }

  private async sendConfig(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("seniorDevMentor");
    const provider = cfg.get<string>("provider", "anthropic");
    const hasKey = provider !== "anthropic" || !!(await this.ctx.secrets.get(SECRET_KEY)) || !!process.env.ANTHROPIC_API_KEY;
    this.post({
      type: "config",
      providerLabel: provider === "anthropic" ? `Claude · ${cfg.get("anthropicModel")}` : `Ollama · ${cfg.get("ollamaModel")}`,
      needsKey: !hasKey,
    });
  }

  private guardOptions() {
    const n = vscode.workspace.getConfiguration("seniorDevMentor").get<number>("maxCodeLines", DEFAULT_GUARD.maxCodeLines);
    const maxCodeLines = Math.max(0, Math.min(8, Math.floor(n)));
    return { ...DEFAULT_GUARD, maxCodeLines, maxCodeChars: Math.max(40, maxCodeLines * 40) };
  }

  private async provider(): Promise<MentorProvider> {
    const cfg = vscode.workspace.getConfiguration("seniorDevMentor");
    if (cfg.get<string>("provider") === "ollama") {
      return new OllamaProvider(cfg.get<string>("ollamaUrl", "http://localhost:11434"), cfg.get<string>("ollamaModel", "llama3.2"));
    }
    return new AnthropicProvider(
      await this.ctx.secrets.get(SECRET_KEY),
      cfg.get<string>("anthropicModel", "claude-opus-5-5"),
      cfg.get<"low" | "medium" | "high">("effort", "medium"),
    );
  }

  // -------------------------------------------------------------- chat

  private async ask(action: MentorAction, text: string): Promise<void> {
    if (this.abort) {
      this.post({ type: "mentor", text: "One thing at a time. Let me finish this answer first (or press **Stop**)." });
      return;
    }
    const code = codeContext(this.lastEditor);
    const label = ACTION_LABELS[action];
    this.post({ type: "user", label: label.text, icon: label.icon, text, fileName: code?.fileName });

    // 1. Deterministic request check: no model call for "just give me the answer".
    const verdict = classifyRequest(text);
    if (verdict.kind !== "allowed") {
      await this.progress.update((p) => p.solutionRequestsRedirected++);
      this.log("redirected", text, () => this.session.redirected++);
      this.post({ type: "mentor", text: redirectMessage(verdict, this.redirects++) });
      this.panda.say("Nice try! Let's figure it out together instead.", "talk");
      return;
    }

    const needsCode: MentorAction[] = ["review", "hint", "explainError", "quiz"];
    if (needsCode.includes(action) && !code) {
      this.post({ type: "mentor", text: "Open the file you're working on first, and select the part you want to talk about (or leave nothing selected for the whole file)." });
      return;
    }
    if (action === "explainError" && code && !code.diagnostics.length) {
      this.post({ type: "mentor", text: "I don't see any errors from the editor in this file. If it fails when you run it, paste the error message into the chat and I'll help you read it." });
      return;
    }

    // 2. Deterministic hint ladder: effort before every rung, no rung with the answer.
    let preambleExtra: string | undefined;
    if (action === "hint" && code) {
      const decision = this.ladder.request(code.problemKey, hashCode(code.fullText), text);
      if (!decision.ok) {
        this.post({ type: "mentor", text: decision.message });
        this.panda.say(decision.reason === "ladder-done" ? "You've got this. The last step is yours!" : "Show me some thinking first!", decision.reason === "ladder-done" ? "cheer" : "talk");
        return;
      }
      preambleExtra = `${decision.level + 1} of ${HINT_LEVELS.length} (${decision.name}). ${decision.instruction}`;
      this.post({ type: "hintLevel", level: decision.level + 1, total: HINT_LEVELS.length, name: decision.name });
      await this.progress.update((p) => p.hintsByLevel[decision.level]++);
      this.session.hints[decision.level]++;
    }

    const content = this.buildUserContent(action, text, code, preambleExtra);
    await this.progress.update((p) => {
      if (action === "review") p.reviews++;
      else if (action === "checkPlan") p.plansChecked++;
      else if (action === "quiz") p.quizzes++;
      else if (action !== "hint") p.questions++;
    });
    if (action === "review") this.session.reviews++;
    else if (action === "checkPlan") this.session.plans.push(text);
    else if (action === "quiz") this.session.quizzes++;
    else if (action !== "hint") this.session.questions++;
    this.log(action, action === "chat" || action === "checkPlan" ? text : code?.fileName ?? "");
    await this.streamReply(content, action, code);
  }

  private buildUserContent(action: MentorAction, text: string, code: CodeContext | undefined, extra?: string): string {
    const parts: string[] = [];
    const pre = actionPreamble(action, action === "teach" ? text : extra);
    if (pre) parts.push(pre);
    if (text && action !== "teach") parts.push(action === "hint" ? `What I've tried / what I think: ${text}` : text);
    const attachCode = action !== "teach" && action !== "checkPlan" ? code : undefined;
    if (attachCode) parts.push(formatContext(attachCode));
    return parts.join("\n\n");
  }

  private async streamReply(userContent: string, action: MentorAction, code: CodeContext | undefined): Promise<void> {
    const id = ++this.replyId;
    const guard = new SolutionGuard(this.guardOptions());
    const abort = new AbortController();
    this.abort = abort;
    this.turns.push({ role: "user", content: userContent });
    this.post({ type: "start", id });
    this.panda.think(true);

    let shown = "";
    try {
      const provider = await this.provider();
      for await (const chunk of provider.stream(systemPrompt(this.guardOptions().maxCodeLines), this.turns.slice(-MAX_TURNS), abort.signal)) {
        const safe = guard.push(chunk);
        if (safe) {
          shown += safe;
          this.post({ type: "delta", id, text: safe });
        }
      }
      const rest = guard.end();
      shown += rest;
      if (rest) this.post({ type: "delta", id, text: rest });
      this.turns.push({ role: "assistant", content: shown.trim() || "(no reply)" });
      this.post({ type: "done", id, hidden: guard.stats.hiddenBlocks });
      this.session.codeHidden += guard.stats.hiddenBlocks;
      for (const c of guard.concepts) this.session.concepts[c] = (this.session.concepts[c] ?? 0) + 1;
      await this.progress.update((p) => {
        p.codeHidden += guard.stats.hiddenBlocks;
        for (const c of guard.concepts) p.concepts[c] = (p.concepts[c] ?? 0) + 1;
      });
      this.panda.think(false);
      if (!(await this.sendPandaToLines(shown, action, code))) this.panda.say("My answer is in the chat.", "cheer", 3000);
    } catch (err) {
      this.panda.think(false);
      this.turns.pop(); // drop the unanswered question so history stays valid
      if (abort.signal.aborted) {
        this.post({ type: "done", id, hidden: guard.stats.hiddenBlocks, stopped: true });
      } else if (err instanceof ProviderError) {
        this.post({ type: "error", id, message: err.message, action: err.action });
      } else {
        this.post({ type: "error", id, message: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` });
      }
    } finally {
      this.abort = undefined;
    }
  }

  /** After a review, hint or error explanation, the panda walks to the lines the reply points at. */
  private async sendPandaToLines(reply: string, action: MentorAction, code: CodeContext | undefined): Promise<boolean> {
    if (!code || !["review", "hint", "explainError"].includes(action)) return false;
    const doc = this.lastEditor?.document;
    if (!doc || doc.uri.toString() !== code.problemKey) return false;
    let stops = extractLineRefs(reply, doc.lineCount).map((r) => ({ line: r.line - 1, note: r.note }));
    if (!stops.length && action === "explainError" && code.diagnosticLines.length) {
      const firstParagraph = reply.split(/\n\s*\n/).find((p) => p.trim()) ?? "";
      stops = [{ line: code.diagnosticLines[0], note: firstParagraph.replace(/\[\[L(\d+)\]\]/g, "line $1") }];
    }
    return stops.length ? this.visitLines(stops) : false;
  }

  // -------------------------------------------------------------- show me (the panda's board)

  /**
   * "Show me": the panda draws on its board. With text, it draws that idea;
   * with code selected, it traces the code; with neither, it offers examples.
   */
  private async showMe(text: string): Promise<void> {
    const prompt = text.replace(SHOW_ME, "").trim();
    const ed = this.lastEditor;
    const useSelection = !prompt && !!ed && !ed.selection.isEmpty;
    if (!prompt && !useSelection) {
      this.board.show({ type: "examples" });
      return;
    }
    if (text.trim()) this.post({ type: "user", label: "Show me", icon: "sparkle", text: prompt });

    const verdict = classifyRequest(prompt);
    if (verdict.kind !== "allowed") {
      this.log("redirected", prompt, () => this.session.redirected++);
      this.board.show({ type: "error", message: "I can draw how something works, but not hand over a solution. Try describing the idea, like \"how does reversing a linked list work?\"" });
      return;
    }
    const code = useSelection ? codeContext(ed) : undefined;
    const user = code
      ? `Trace this code of mine step by step with a small example input and draw the data structures it builds or changes.\n\n${formatContext(code)}`
      : `Visualize: ${prompt}`;

    this.sideAbort?.abort();
    const abort = new AbortController();
    this.sideAbort = abort;
    this.board.show({ type: "loading", text: code ? `Tracing your code in ${code.fileName}…` : `Drawing "${prompt}"…` });
    this.post({ type: "mentor", text: "I'm drawing it on my board, over there →" });
    try {
      const raw = await (await this.provider()).json(scenePrompt(), user, SceneSchema, abort.signal);
      if (abort.signal.aborted) return;
      const scene = normalizeScene(raw, this.guardOptions());
      this.board.show({ type: "scene", scene });
      await this.progress.update((p) => p.visualizations++);
      this.log("visualized", scene.title, () => this.session.visualized.push(scene.title));
    } catch (err) {
      if (abort.signal.aborted) return;
      this.board.show({ type: "error", message: err instanceof Error ? err.message : String(err), action: err instanceof ProviderError ? err.action : undefined });
    } finally {
      if (this.sideAbort === abort) this.sideAbort = undefined;
    }
  }

  /** "Show me" from the editor's context menu or the command palette. */
  async showMeFromEditor(): Promise<void> {
    await this.showMe("");
  }

  private async recordPrediction(right: boolean): Promise<void> {
    this.session.predictionsTotal++;
    if (right) this.session.predictionsRight++;
    await this.progress.update((p) => {
      p.predictionsTotal++;
      if (right) p.predictionsRight++;
    });
  }

  // -------------------------------------------------------------- wrap up

  /** The panda presents what happened this session on its board, then a new session starts. */
  async wrapUp(): Promise<void> {
    if (isEmptySession(this.session)) {
      this.post({ type: "mentor", text: "Nothing to wrap up yet. Check a plan, ask a question or try a visualization first, and I'll keep track." });
      return;
    }
    this.sideAbort?.abort();
    const abort = new AbortController();
    this.sideAbort = abort;
    this.board.show({ type: "loading", text: "Looking back at what you did…" });
    this.post({ type: "mentor", text: "Wrapping up. The panda is putting your session on its board →" });
    try {
      const raw = await (await this.provider()).json(summaryPrompt(), summaryInput(this.session, this.turns), SummarySchema, abort.signal);
      if (abort.signal.aborted) return;
      const summary = normalizeSummary(raw, this.guardOptions());
      const stats = sessionStats(this.session, Date.now(), streak(this.progress.get().activeDays));
      this.lastSummary = { summary, stats };
      this.board.show({ type: "summary", summary, stats });
      this.session = newSessionLog();
    } catch (err) {
      if (abort.signal.aborted) return;
      this.board.show({ type: "error", message: err instanceof Error ? err.message : String(err), action: err instanceof ProviderError ? err.action : undefined });
    } finally {
      if (this.sideAbort === abort) this.sideAbort = undefined;
    }
  }

  private async saveNotes(): Promise<void> {
    if (!this.lastSummary) return;
    const day = new Date().toISOString().slice(0, 10);
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const target = await vscode.window.showSaveDialog({
      defaultUri: folder ? vscode.Uri.joinPath(folder, `mentor-notes-${day}.md`) : undefined,
      filters: { Markdown: ["md"] },
      title: "Save your wrap-up as notes",
    });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, Buffer.from(summaryMarkdown(this.lastSummary.summary, this.lastSummary.stats)));
    void vscode.window.showInformationMessage(`Saved your notes to ${path.basename(target.fsPath)}.`, "Open").then((pick) => {
      if (pick) void vscode.window.showTextDocument(target);
    });
  }

  // -------------------------------------------------------------- page

  private html(webview: vscode.Webview, media: vscode.Uri): string {
    const nonce = [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
    const uri = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(media, f));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${uri("codicons/codicon.css")}" rel="stylesheet">
<link href="${uri("main.css")}" rel="stylesheet">
<title>Senior Dev Mentor</title>
</head>
<body>
<div id="keyBanner" class="banner" hidden>
  <span>Add an Anthropic API key, or use a free local model through Ollama.</span>
  <span class="row"><button data-cmd="setApiKey">Add key</button><button class="secondary" data-cmd="openSettings">Use Ollama</button></span>
</div>
<div id="log" class="log" aria-live="polite">
  <div class="msg mentor intro">
    <p>Hi! I won't write your code. I'll help you <b>think</b> until you can.</p>
    <p class="muted">The panda in your editor will walk to lines worth a look. Try <b>Plan</b> before you code, and <b>Show me</b> to see an idea drawn out.</p>
  </div>
</div>
<div id="hintMeter" class="hint-meter" hidden></div>
<div class="actions" role="toolbar" aria-label="Mentor actions">
  <button class="act" data-action="checkPlan" title="Check my plan: describe your approach in the box first">${icon("checklist")}Plan</button>
  <button class="act" data-action="hint" title="Hint: write what you tried in the box first">${icon("lightbulb")}Hint</button>
  <button class="act" data-action="review" title="Review my attempt: uses your selection, or the whole file">${icon("search")}Review</button>
  <button class="act" data-action="explainError" title="Help me understand this error">${icon("bug")}Error</button>
  <button class="act" data-action="quiz" title="Quiz me on my code">${icon("question")}Quiz</button>
  <button class="act" id="showMe" title="Show me: draw the idea in the box, or trace your selected code, on the panda's board">${icon("sparkle")}Show me</button>
</div>
<form id="composer" class="composer">
  <textarea id="input" rows="3" placeholder="Ask, describe your plan, or say what you tried…"></textarea>
  <div class="row">
    <span id="provider" class="muted small"></span>
    <span class="row">
      <button type="button" id="wrapUp" class="icon-btn" title="Wrap up: the panda summarizes this session">${icon("notebook")}</button>
      <button type="button" id="newProblem" class="icon-btn" title="New problem: reset hints and the chat">${icon("add")}</button>
      <button type="button" id="stop" class="secondary" hidden>${icon("debug-stop")}Stop</button>
      <button type="submit" id="send">${icon("send")}Send</button>
    </span>
  </div>
</form>
<script nonce="${nonce}" src="${uri("markdown.js")}"></script>
<script nonce="${nonce}" src="${uri("main.js")}"></script>
</body>
</html>`;
  }
}
