import * as vscode from "vscode";
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

export const SECRET_KEY = "seniorDevMentor.anthropicApiKey";
const MAX_TURNS = 12;

type FromWebview =
  | { type: "ready" }
  | { type: "ask"; action: MentorAction; text: string }
  | { type: "stop" }
  | { type: "newProblem" }
  | { type: "setApiKey" }
  | { type: "openSettings" }
  | { type: "prediction"; right: boolean }
  | { type: "resetProgress" }
  | { type: "visitLine"; line: number; note: string }
  | { type: "pandaDismiss" }
  | { type: "visualize"; prompt: string; useSelection: boolean };

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

const icon = (name: string) => `<i class="codicon codicon-${name}" aria-hidden="true"></i>`;

export class MentorViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private turns: ChatTurn[] = [];
  private ladder = new HintLadder();
  private redirects = 0;
  private abort?: AbortController;
  private lastEditor?: vscode.TextEditor;
  private replyId = 0;
  private pending: unknown[] = [];
  private sceneAbort?: AbortController;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly progress: ProgressStore,
    private readonly panda: EditorPanda,
  ) {
    this.lastEditor = vscode.window.activeTextEditor;
    ctx.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e) this.lastEditor = e;
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
    this.post({ type: "nudge", question, line, fileName, walked });
  }

  /** The editor panda moved (or came home); the sidebar panda mirrors it. */
  pandaMoved(where: PandaWhereabouts | null): void {
    this.post(where ? { type: "pandaAway", ...where } : { type: "pandaBack" });
  }

  /** Send the panda to lines of the file the student is working on. */
  async visitLines(stops: { line: number; note: string }[]): Promise<boolean> {
    const ed = this.lastEditor;
    if (!ed || ed.document.isClosed || !this.editorPandaEnabled()) return false;
    return this.panda.tour(ed.document.uri, stops, { reveal: true, viewColumn: ed.viewColumn });
  }

  editorPandaEnabled(): boolean {
    const cfg = vscode.workspace.getConfiguration("seniorDevMentor");
    return cfg.get<boolean>("mascot", true) && cfg.get<boolean>("editorPanda", true);
  }

  newProblem(): void {
    this.ladder.reset();
    this.turns = [];
    this.post({ type: "cleared" });
  }

  refreshConfig(): void {
    void this.sendConfig();
  }

  private post(msg: unknown): void {
    if (this.view) void this.view.webview.postMessage(msg);
    else this.pending.push(msg);
  }

  private async onMessage(m: FromWebview): Promise<void> {
    switch (m.type) {
      case "ready":
        await this.sendConfig();
        this.sendProgress();
        for (const p of this.pending.splice(0)) this.post(p);
        break;
      case "ask":
        await this.ask(m.action, m.text);
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
      case "prediction":
        await this.progress.update((p) => {
          p.predictionsTotal++;
          if (m.right) p.predictionsRight++;
        });
        this.sendProgress();
        break;
      case "resetProgress":
        await this.progress.reset();
        this.sendProgress();
        break;
      case "visitLine":
        if (!(await this.visitLines([{ line: m.line - 1, note: m.note }]))) {
          // No editor panda: just jump to the line.
          const ed = this.lastEditor;
          if (ed) {
            const pos = new vscode.Position(Math.max(0, m.line - 1), 0);
            await vscode.window.showTextDocument(ed.document, { viewColumn: ed.viewColumn, selection: new vscode.Range(pos, pos) });
          }
        }
        break;
      case "pandaDismiss":
        this.panda.dismiss();
        break;
      case "visualize":
        await this.visualize(m.prompt, m.useSelection);
        break;
    }
  }

  private async sendConfig(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("seniorDevMentor");
    const provider = cfg.get<string>("provider", "anthropic");
    const hasKey = provider !== "anthropic" || !!(await this.ctx.secrets.get(SECRET_KEY)) || !!process.env.ANTHROPIC_API_KEY;
    this.post({
      type: "config",
      mascot: cfg.get<boolean>("mascot", true),
      providerLabel: provider === "anthropic" ? `Claude · ${cfg.get("anthropicModel")}` : `Ollama · ${cfg.get("ollamaModel")}`,
      needsKey: !hasKey,
      maxCodeLines: this.guardOptions().maxCodeLines,
    });
  }

  private sendProgress(): void {
    const p = this.progress.get();
    this.post({ type: "progress", data: p, streak: streak(p.activeDays) });
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
      this.post({ type: "mentor", text: redirectMessage(verdict, this.redirects++), mood: "wag" });
      this.sendProgress();
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
        this.post({ type: "mentor", text: decision.message, mood: decision.reason === "ladder-done" ? "cheer" : "think" });
        return;
      }
      preambleExtra = `${decision.level + 1} of ${HINT_LEVELS.length} (${decision.name}). ${decision.instruction}`;
      this.post({ type: "hintLevel", level: decision.level + 1, total: HINT_LEVELS.length, name: decision.name });
      await this.progress.update((p) => p.hintsByLevel[decision.level]++);
    }

    const content = this.buildUserContent(action, text, code, preambleExtra);
    await this.progress.update((p) => {
      if (action === "review") p.reviews++;
      else if (action === "checkPlan") p.plansChecked++;
      else if (action === "quiz") p.quizzes++;
      else if (action !== "hint") p.questions++;
    });
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
      await this.progress.update((p) => {
        p.codeHidden += guard.stats.hiddenBlocks;
        for (const c of guard.concepts) p.concepts[c] = (p.concepts[c] ?? 0) + 1;
      });
      this.sendProgress();
      await this.sendPandaToLines(shown, action, code);
    } catch (err) {
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
  private async sendPandaToLines(reply: string, action: MentorAction, code: CodeContext | undefined): Promise<void> {
    if (!code || !["review", "hint", "explainError"].includes(action)) return;
    const doc = this.lastEditor?.document;
    if (!doc || doc.uri.toString() !== code.problemKey) return;
    let stops = extractLineRefs(reply, doc.lineCount).map((r) => ({ line: r.line - 1, note: r.note }));
    if (!stops.length && action === "explainError" && code.diagnosticLines.length) {
      const firstParagraph = reply.split(/\n\s*\n/).find((p) => p.trim()) ?? "";
      stops = [{ line: code.diagnosticLines[0], note: firstParagraph.replace(/\[\[L(\d+)\]\]/g, "line $1") }];
    }
    if (stops.length) await this.visitLines(stops);
  }

  /** "Visualize anything": ask the model for a scene, check it, send it to the player. */
  private async visualize(prompt: string, useSelection: boolean): Promise<void> {
    this.sceneAbort?.abort();
    const verdict = classifyRequest(prompt);
    if (verdict.kind !== "allowed") {
      await this.progress.update((p) => p.solutionRequestsRedirected++);
      this.post({ type: "sceneError", message: "I can draw how something works, but not hand over a solution. Try describing the idea, like \"how does reversing a linked list work?\"" });
      return;
    }
    const code = useSelection ? codeContext(this.lastEditor) : undefined;
    if (useSelection && !code) {
      this.post({ type: "sceneError", message: "Open your file and select the code you want to see run, then try again." });
      return;
    }
    if (!prompt.trim() && !code) {
      this.post({ type: "sceneError", message: "Describe what you want to see, or pick an example." });
      return;
    }
    const user = code
      ? `Trace this code of mine step by step with a small example input and draw the data structures it builds or changes.${prompt.trim() ? ` What I want to see: ${prompt.trim()}` : ""}\n\n${formatContext(code)}`
      : `Visualize: ${prompt.trim()}`;

    const abort = new AbortController();
    this.sceneAbort = abort;
    this.post({ type: "sceneLoading" });
    try {
      const raw = await (await this.provider()).json(scenePrompt(), user, SceneSchema, abort.signal);
      if (abort.signal.aborted) return;
      const scene = normalizeScene(raw, this.guardOptions());
      this.post({ type: "scene", scene });
      await this.progress.update((p) => p.visualizations++);
      this.sendProgress();
    } catch (err) {
      if (abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: "sceneError", message, action: err instanceof ProviderError ? err.action : undefined });
    } finally {
      if (this.sceneAbort === abort) this.sceneAbort = undefined;
    }
  }

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
<nav class="tabs" role="tablist">
  <button role="tab" class="tab active" data-tab="mentor" aria-selected="true">Mentor</button>
  <button role="tab" class="tab" data-tab="visualize" aria-selected="false">Visualize</button>
  <button role="tab" class="tab" data-tab="progress" aria-selected="false">Progress</button>
</nav>

<section id="tab-mentor" class="panel active">
  <div id="keyBanner" class="banner" hidden>
    <span>Add an Anthropic API key, or use a free local model through Ollama.</span>
    <span class="row"><button data-cmd="setApiKey">Add key</button><button class="secondary" data-cmd="openSettings">Use Ollama</button></span>
  </div>
  <div id="log" class="log" aria-live="polite">
    <div class="msg mentor intro">
      <p>Hi! I'm your mentor. I won't write your code. I'll help you <b>think</b> until you can write it yourself.</p>
      <p class="muted">Start with <b>Check my plan</b> before you code, <b>Hint</b> when you're stuck, and <b>Review my attempt</b> when you have something.</p>
    </div>
  </div>
  <div id="hintMeter" class="hint-meter" hidden></div>
  <div class="actions">
    <button data-action="checkPlan" title="Describe your approach in the box first">${icon("checklist")}Check my plan</button>
    <button data-action="hint" title="Write what you tried in the box first">${icon("lightbulb")}Hint</button>
    <button data-action="review" title="Uses your selection, or the whole file">${icon("search")}Review my attempt</button>
    <button data-action="explainError">${icon("bug")}Explain error</button>
    <button data-action="quiz">${icon("question")}Quiz me</button>
    <button data-action="teach" title="Type a topic, like 'python dictionaries'">${icon("book")}Teach me</button>
  </div>
  <form id="composer" class="composer">
    <textarea id="input" rows="3" placeholder="Ask a question, describe your plan, or say what you tried…"></textarea>
    <div class="row">
      <span id="provider" class="muted small"></span>
      <span class="row">
        <button type="button" id="newProblem" class="secondary" title="Reset hints for a new problem">${icon("add")}New problem</button>
        <button type="button" id="stop" class="secondary" hidden>${icon("debug-stop")}Stop</button>
        <button type="submit" id="send">${icon("send")}Send</button>
      </span>
    </div>
  </form>
  <div id="stage" class="stage" aria-hidden="true">
    <div id="bubble" class="bubble" hidden></div>
    <div id="panda" class="panda idle" title="Click me">
      <div class="ear l"></div><div class="ear r"></div>
      <div class="head"><div class="patch l"><div class="eye"></div></div><div class="patch r"><div class="eye"></div></div><div class="nose"></div><div class="mouth"></div><div class="blush l"></div><div class="blush r"></div></div>
      <div class="body"><div class="arm l"></div><div class="arm r"></div></div>
      <div class="leg l"></div><div class="leg r"></div>
      <div class="zzz">z<span>z</span><span>z</span></div>
      <div class="dots"><span></span><span></span><span></span></div>
    </div>
    <div id="awaySign" class="away-sign" hidden>
      <span id="awayText"></span>
      <button id="awayBack" class="secondary small" title="Send the panda back to the sidebar">${icon("home")}Call back</button>
    </div>
  </div>
</section>

<section id="tab-visualize" class="panel">
  <div class="seg" role="tablist">
    <button class="seg-btn active" data-viz="anything" role="tab">${icon("sparkle")}Anything</button>
    <button class="seg-btn" data-viz="sorting" role="tab">${icon("graph")}Sorting &amp; search</button>
  </div>

  <div id="viz-anything" class="viz-pane active">
    <textarea id="vizPrompt" rows="2" placeholder="What do you want to see? e.g. 'how a linked list gets reversed', 'collisions in a hash map', 'DFS on a graph'"></textarea>
    <div class="row viz-ask">
      <span class="row">
        <button id="vizGo">${icon("sparkle")}Visualize</button>
        <button id="vizCode" class="secondary" title="Trace your selected code (or the whole file) with a small example input">${icon("code")}My code</button>
      </span>
      <label class="check small"><input id="scenePredict" type="checkbox" checked> Predict</label>
    </div>
    <div class="examples">
      <span class="muted small">Examples (work offline):</span>
      <button class="chip" data-example="linkedListReverse">Reverse a linked list</button>
      <button class="chip" data-example="stackOps">Stack</button>
      <button class="chip" data-example="queueOps">Queue</button>
      <button class="chip" data-example="bfs">BFS on a graph</button>
      <button class="chip" data-example="hashChaining">Hash table</button>
      <button class="chip" data-example="treeInorder">BST traversal</button>
    </div>
    <div id="sceneStatus" class="scene-status" hidden></div>
    <div id="sceneBox" class="scene-box" hidden>
      <div id="sceneTitle" class="scene-title"></div>
      <div id="sceneStage" class="scene-stage"><svg id="sceneSvg" class="scene-svg"></svg></div>
      <div id="sceneCaption" class="caption"></div>
      <div id="scenePredictBox" class="predict" hidden></div>
      <div class="row scene-controls">
        <span class="row">
          <button id="scenePrev" class="secondary" title="Previous step">${icon("arrow-left")}</button>
          <button id="scenePlay">${icon("play")}Play</button>
          <button id="sceneNext" class="secondary" title="Next step">${icon("arrow-right")}</button>
        </span>
        <span id="sceneCounter" class="muted small"></span>
      </div>
    </div>
  </div>

  <div id="viz-sorting" class="viz-pane">
  <div class="viz-controls">
    <label>Algorithm
      <select id="algo">
        <option value="bubble">Bubble sort</option>
        <option value="selection">Selection sort</option>
        <option value="insertion">Insertion sort</option>
        <option value="merge">Merge sort</option>
        <option value="quick">Quick sort</option>
        <option value="binary">Binary search</option>
        <option value="bst">Binary search tree insert</option>
      </select>
    </label>
    <label>Size <input id="size" type="range" min="5" max="24" value="10"></label>
    <label>Speed <input id="speed" type="range" min="1" max="10" value="5"></label>
    <label class="check"><input id="predict" type="checkbox" checked> Predict mode</label>
  </div>
  <div class="row viz-buttons">
    <button id="play">${icon("play")}Play</button><button id="step" class="secondary">${icon("debug-step-over")}Step</button><button id="shuffle" class="secondary">${icon("refresh")}New data</button>
  </div>
  <svg id="canvas" class="canvas" role="img" aria-label="Algorithm visualization"></svg>
  <div id="vizCaption" class="caption"></div>
  <div id="predictBox" class="predict" hidden></div>
  <pre id="pseudo" class="pseudo"></pre>
  <div id="vizStats" class="muted small"></div>
  </div>
</section>

<section id="tab-progress" class="panel">
  <div id="progressBody"></div>
  <button id="resetProgress" class="secondary small">Reset progress</button>
</section>

<script nonce="${nonce}" src="${uri("markdown.js")}"></script>
<script nonce="${nonce}" src="${uri("mascot.js")}"></script>
<script nonce="${nonce}" src="${uri("visualizer.js")}"></script>
<script nonce="${nonce}" src="${uri("scene.js")}"></script>
<script nonce="${nonce}" src="${uri("main.js")}"></script>
</body>
</html>`;
  }
}
