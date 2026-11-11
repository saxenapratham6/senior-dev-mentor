import * as vscode from "vscode";
import * as path from "path";
import { MentorViewProvider, SECRET_KEY } from "./mentorView";
import { ProgressStore } from "./progress";
import { findNudges } from "./heuristics";
import { EditorPanda, plain } from "./editorPanda";
import type { PandaBoard } from "./board";
import type { Classroom } from "./classroom";
import { RepoGuide } from "./repoGuide";

const NUDGE_LANGUAGES = new Set(["python", "javascript", "typescript", "java", "c", "cpp", "csharp", "go", "rust"]);

/** Returned so the integration tests can reach the panda; not a public API. */
export function activate(context: vscode.ExtensionContext): { panda: EditorPanda; board: PandaBoard; classroom: Classroom; guide: RepoGuide } {
  const progress = new ProgressStore(context.globalState);
  let mentor: MentorViewProvider | undefined;
  let guide: RepoGuide | undefined;
  const panda = new EditorPanda(context.extensionUri, (where) => {
    mentor?.pandaMoved(where);
    guide?.pandaMoved(where);
  });
  mentor = new MentorViewProvider(context, progress, panda);
  guide = new RepoGuide(context, panda, mentor.board);
  mentor.repoActions = (a) => void guide.onAction(a);
  guide.aiSetup = () => mentor.aiSetup();
  context.subscriptions.push(panda, guide);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("seniorDevMentor.view", mentor, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("seniorDevMentor.focus", () => vscode.commands.executeCommand("seniorDevMentor.view.focus")),
    vscode.commands.registerCommand("seniorDevMentor.review", () => mentor.run("review")),
    vscode.commands.registerCommand("seniorDevMentor.hint", () => mentor.run("hint")),
    vscode.commands.registerCommand("seniorDevMentor.explainError", () => mentor.run("explainError")),
    vscode.commands.registerCommand("seniorDevMentor.newProblem", () => mentor.newProblem()),
    vscode.commands.registerCommand("seniorDevMentor.showMe", () => mentor.showMeFromEditor()),
    vscode.commands.registerCommand("seniorDevMentor.wrapUp", () => mentor.wrapUp()),
    vscode.commands.registerCommand("seniorDevMentor.roadmap", () => mentor.showRoadmap()),
    vscode.commands.registerCommand("seniorDevMentor.openLesson", (id?: string) => (id ? mentor.showLesson(id) : mentor.showRoadmap())),
    vscode.commands.registerCommand("seniorDevMentor.tour", () => guide.open()),
    vscode.commands.registerCommand("seniorDevMentor.explain", (uri?: vscode.Uri) => guide.explain(uri)),
    vscode.commands.registerCommand("seniorDevMentor.pandaNext", () => panda.next()),
    vscode.commands.registerCommand("seniorDevMentor.pandaBack", () => panda.back()),
    vscode.commands.registerCommand("seniorDevMentor.pandaDismiss", () => panda.dismiss()),
    vscode.commands.registerCommand("seniorDevMentor.pandaAsk", () => {
      const stop = panda.current;
      if (!stop) return;
      return mentor.run("chat", `About line ${stop.line + 1}: "${plain(stop.note, 200)}" Can you help me understand this better? I want to work out the change myself.`);
    }),
    vscode.commands.registerCommand("seniorDevMentor.setApiKey", async () => {
      const key = await vscode.window.showInputBox({
        title: "Anthropic API key",
        prompt: "Stored in VS Code's secret storage on this computer. Get one at console.anthropic.com.",
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim().startsWith("sk-ant-") ? undefined : "Anthropic keys start with sk-ant-"),
      });
      if (!key) return;
      await context.secrets.store(SECRET_KEY, key.trim());
      mentor.refreshConfig();
      vscode.window.showInformationMessage("Mentor: API key saved.");
    }),
    vscode.commands.registerCommand("seniorDevMentor.clearApiKey", async () => {
      await context.secrets.delete(SECRET_KEY);
      mentor.refreshConfig();
      vscode.window.showInformationMessage("Mentor: API key removed.");
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("seniorDevMentor")) mentor.refreshConfig();
    }),
  );

  // On save, the panda may ask one question about something it noticed.
  // At most one nudge per file per question, so it never nags.
  const asked = new Set<string>();
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!vscode.workspace.getConfiguration("seniorDevMentor").get<boolean>("nudgeOnSave", true)) return;
      if (!NUDGE_LANGUAGES.has(doc.languageId) || doc.lineCount > 3000) return;
      const fresh = findNudges(doc.getText()).find((n) => !asked.has(`${doc.uri}#${n.concept}`));
      if (!fresh) return;
      asked.add(`${doc.uri}#${fresh.concept}`);
      // The panda walks over only if that line is already on screen; it never scrolls someone's editor.
      void (async () => {
        const walked = await panda.tour(doc.uri, [{ line: fresh.line, note: fresh.question }], { reveal: false });
        mentor.nudge(fresh.question, fresh.line, path.basename(doc.fileName), walked);
      })();
    }),
  );
  return { panda, board: mentor.board, classroom: mentor.classroom, guide };
}

export function deactivate(): void {}
