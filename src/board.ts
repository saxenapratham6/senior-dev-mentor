import * as vscode from "vscode";
import type { Scene } from "./scene";
import type { Summary, SessionStats } from "./summary";
import type { RoadmapPhase, RoadmapState, RoadmapProgress } from "./roadmap";
import type { Lesson } from "./lessons/types";
import type { LessonOutputs } from "./lessons/index";
import type { RunResult } from "./lessons/run";
import type { CheckResult } from "./classroom";

// The panda's board: a panel beside the code where the panda presents things
// that need room, like a visualization it walks you through, or the wrap-up.

export type BoardMessage =
  | { type: "loading"; text: string }
  | { type: "scene"; scene: Scene }
  | { type: "examples" }
  | { type: "summary"; summary: Summary; stats: SessionStats }
  | { type: "error"; message: string; action?: string }
  | { type: "roadmap"; phases: RoadmapPhase[]; state: RoadmapState; progress: RoadmapProgress; milestones: { count: number; label: string }[] }
  | {
      type: "lesson";
      lesson: Lesson;
      unitTitle: string;
      saved: LessonOutputs;
      nav: { prev?: { id: string; title: string }; next?: { id: string; title: string } };
      done: boolean;
      passed: string[];
      ladder: string[];
      ladderUrls: Record<string, string>;
    }
  | { type: "runResult"; exampleId: string; result: RunResult & { saved?: boolean } }
  | { type: "checkResult"; exerciseId: string; result: CheckResult }
  | { type: "lessonState"; done: boolean; passed: string[]; ladder: string[] };

/** Everything the lesson view can ask for. */
export type LessonAction =
  | { type: "openLesson"; id: string }
  | { type: "runExample"; id: string }
  | { type: "exampleInEditor"; id: string }
  | { type: "startExercise"; lessonId: string; exerciseId: string }
  | { type: "checkExercise"; lessonId: string; exerciseId: string }
  | { type: "exerciseHint"; lessonId: string; exerciseId: string }
  | { type: "lessonDone"; id: string }
  | { type: "ladderToggle"; lessonId: string; name: string }
  | { type: "askAboutLesson"; id: string }
  | { type: "backToRoadmap" };

const LESSON_ACTIONS = new Set(["openLesson", "runExample", "exampleInEditor", "startExercise", "checkExercise", "exerciseHint", "lessonDone", "ladderToggle", "askAboutLesson", "backToRoadmap"]);

type FromBoard =
  | { type: "ready" }
  | { type: "prediction"; right: boolean }
  | { type: "saveNotes" }
  | { type: "fix"; action: string }
  | { type: "example"; name: string }
  | { type: "roadmapToggle"; id: string }
  | { type: "roadmapSolved"; difficulty: "easy" | "medium" | "hard"; delta: 1 | -1 }
  | { type: "openUrl"; url: string }
  | { type: "guideMe"; id: string }
  | LessonAction;

export interface BoardHooks {
  onOpen(): void;
  onClose(): void;
  onPrediction(right: boolean): void;
  onSaveNotes(): void;
  onFix(action: string): void;
  onExample(name: string): void;
  onRoadmapToggle(id: string): void;
  onRoadmapSolved(difficulty: "easy" | "medium" | "hard", delta: 1 | -1): void;
  onOpenUrl(url: string): void;
  onGuideMe(id: string): void;
  onLesson(action: LessonAction): void;
}

export class PandaBoard implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private ready = false;
  private queue: BoardMessage[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly hooks: BoardHooks,
  ) {}

  get isOpen(): boolean {
    return !!this.panel;
  }

  show(msg: BoardMessage): void {
    if (!this.panel) this.open();
    else this.panel.reveal(undefined, true);
    if (this.ready) void this.panel!.webview.postMessage(msg);
    else this.queue.push(msg);
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private open(): void {
    const media = vscode.Uri.joinPath(this.extensionUri, "media");
    this.panel = vscode.window.createWebviewPanel(
      "seniorDevMentor.board",
      "Panda's board",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] },
    );
    this.panel.iconPath = vscode.Uri.joinPath(media, "mentor-icon.svg");
    this.ready = false;
    this.panel.webview.html = boardHtml(this.panel.webview, media);
    this.panel.webview.onDidReceiveMessage((m: FromBoard) => {
      if (LESSON_ACTIONS.has(m.type)) return this.hooks.onLesson(m as LessonAction);
      switch (m.type) {
        case "ready":
          this.ready = true;
          for (const q of this.queue.splice(0)) void this.panel?.webview.postMessage(q);
          break;
        case "prediction":
          this.hooks.onPrediction(m.right);
          break;
        case "saveNotes":
          this.hooks.onSaveNotes();
          break;
        case "fix":
          this.hooks.onFix(m.action);
          break;
        case "example":
          this.hooks.onExample(m.name);
          break;
        case "roadmapToggle":
          this.hooks.onRoadmapToggle(m.id);
          break;
        case "roadmapSolved":
          this.hooks.onRoadmapSolved(m.difficulty, m.delta);
          break;
        case "openUrl":
          this.hooks.onOpenUrl(m.url);
          break;
        case "guideMe":
          this.hooks.onGuideMe(m.id);
          break;
      }
    });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.ready = false;
      this.queue = [];
      this.hooks.onClose();
    });
    this.hooks.onOpen();
  }
}

const icon = (name: string) => `<i class="codicon codicon-${name}" aria-hidden="true"></i>`;

function boardHtml(webview: vscode.Webview, media: vscode.Uri): string {
  const nonce = [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
  const uri = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(media, f));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${uri("codicons/codicon.css")}" rel="stylesheet">
<link href="${uri("board.css")}" rel="stylesheet">
<title>Panda's board</title>
</head>
<body data-sprites="${uri("panda")}">
<main class="board">
  <header class="board-head">
    <h1 id="title">Panda's board</h1>
    <span id="counter" class="muted"></span>
  </header>

  <section id="sceneView" class="view" hidden>
    <div id="sceneStage" class="scene-stage"><svg id="sceneSvg" class="scene-svg"></svg></div>
    <div id="floor" class="floor">
      <img id="panda" class="panda" alt="" src="${uri("panda/sit.svg")}">
      <div id="bubble" class="bubble">
        <div id="caption" class="caption"></div>
        <div id="predictBox" class="predict" hidden></div>
      </div>
    </div>
    <div class="controls">
      <button id="prev" class="secondary" title="Previous step">${icon("arrow-left")}</button>
      <button id="play">${icon("play")}Play</button>
      <button id="next" class="secondary" title="Next step">${icon("arrow-right")}</button>
      <label class="check"><input id="predict" type="checkbox" checked> Ask me to predict</label>
      <button id="more" class="link" title="Other things the panda can show">${icon("library")}More examples</button>
    </div>
  </section>

  <section id="examplesView" class="view" hidden>
    <div class="intro">
      <img class="panda big" alt="" src="${uri("panda/talk.svg")}">
      <div class="bubble static">
        <p><b>What should I draw?</b></p>
        <p class="muted">Type an idea in the chat and press <b>Show me</b>, select some of your code and press <b>Show me</b> to watch it run, or pick one of these. They work offline.</p>
      </div>
    </div>
    <div class="example-groups">
      <div><h2>Data structures</h2>
        <button class="chip" data-example="linkedListReverse">Reverse a linked list</button>
        <button class="chip" data-example="stackOps">Stack</button>
        <button class="chip" data-example="queueOps">Queue</button>
        <button class="chip" data-example="hashChaining">Hash table</button>
        <button class="chip" data-example="treeInorder">BST traversal</button>
        <button class="chip" data-example="bfs">BFS on a graph</button>
      </div>
      <div><h2>Sorting and searching</h2>
        <button class="chip" data-example="algo:bubble">Bubble sort</button>
        <button class="chip" data-example="algo:selection">Selection sort</button>
        <button class="chip" data-example="algo:insertion">Insertion sort</button>
        <button class="chip" data-example="algo:merge">Merge sort</button>
        <button class="chip" data-example="algo:quick">Quick sort</button>
        <button class="chip" data-example="algo:binary">Binary search</button>
        <button class="chip" data-example="algo:bst">BST insert</button>
      </div>
    </div>
  </section>

  <section id="loadingView" class="view" hidden>
    <div class="intro">
      <img class="panda big" alt="" src="${uri("panda/think.svg")}">
      <div class="bubble static"><p id="loadingText">Drawing it…</p></div>
    </div>
  </section>

  <section id="roadmapView" class="view" hidden>
    <div class="intro">
      <img id="roadmapPanda" class="panda big" alt="" src="${uri("panda/talk.svg")}">
      <div class="bubble static"><p id="roadmapHeadline"></p><p id="roadmapNext" class="muted"></p></div>
    </div>
    <div class="roadmap-top">
      <div class="meter"><div class="meter-label"><span>Roadmap</span><span id="roadmapPercent"></span></div><div class="meter-bar"><span id="roadmapBar"></span></div></div>
      <div class="solved" aria-label="Problems solved">
        <div class="meter-label"><span>Problems solved</span><span id="solvedTotal"></span></div>
        <div class="solved-row">
          <span class="counter easy"><button data-solved="easy" data-delta="-1" title="One fewer easy" aria-label="One fewer easy">${icon("remove")}</button><b id="solved-easy">0</b> easy<button data-solved="easy" data-delta="1" title="Solved an easy" aria-label="Solved an easy">${icon("add")}</button></span>
          <span class="counter medium"><button data-solved="medium" data-delta="-1" title="One fewer medium" aria-label="One fewer medium">${icon("remove")}</button><b id="solved-medium">0</b> medium<button data-solved="medium" data-delta="1" title="Solved a medium" aria-label="Solved a medium">${icon("add")}</button></span>
          <span class="counter hard"><button data-solved="hard" data-delta="-1" title="One fewer hard" aria-label="One fewer hard">${icon("remove")}</button><b id="solved-hard">0</b> hard<button data-solved="hard" data-delta="1" title="Solved a hard" aria-label="Solved a hard">${icon("add")}</button></span>
        </div>
        <div id="milestones" class="milestones"></div>
      </div>
    </div>
    <div id="phases" class="phases"></div>
    <p class="muted small">Daily rhythm: 2 problems a day; redo each one after 1, 3 and 7 days; note the pattern you recognized. Stuck? Use the mentor's Hint before reading a solution.</p>
  </section>

  <section id="lessonView" class="view" hidden>
    <nav class="lesson-nav">
      <button class="link" data-back title="Back to your roadmap">${icon("arrow-left")}Roadmap</button>
      <span id="lessonUnit" class="muted small"></span>
    </nav>
    <div class="intro">
      <img id="lessonPanda" class="panda big" alt="" src="${uri("panda/talk.svg")}">
      <div class="bubble static"><p id="lessonSummary"></p><p id="lessonMeta" class="muted small"></p></div>
    </div>
    <div id="lessonBody" class="lesson-body"></div>
    <div class="lesson-footer">
      <button id="lessonPrev" class="secondary" hidden></button>
      <button id="lessonDone">${icon("pass")}Mark lesson complete</button>
      <button id="lessonAsk" class="secondary" title="Talk this lesson through with the mentor">${icon("mortar-board")}Ask the mentor</button>
      <button id="lessonNext" class="secondary" hidden></button>
    </div>
  </section>

  <section id="summaryView" class="view" hidden>
    <div class="intro">
      <img class="panda big" alt="" src="${uri("panda/cheer.svg")}">
      <div class="bubble static"><p id="headline"></p><p id="numbers" class="muted small"></p></div>
    </div>
    <div id="summaryCards" class="cards"></div>
    <div class="controls">
      <button id="saveNotes">${icon("save")}Save as notes</button>
    </div>
  </section>
</main>
<script nonce="${nonce}" src="${uri("visualizer.js")}"></script>
<script nonce="${nonce}" src="${uri("scene.js")}"></script>
<script nonce="${nonce}" src="${uri("board.js")}"></script>
</body>
</html>`;
}
