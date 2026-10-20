import * as vscode from "vscode";
import * as path from "path";
import { MentorViewProvider, SECRET_KEY } from "./mentorView";
import { ProgressStore } from "./progress";
import { findNudges } from "./heuristics";

const NUDGE_LANGUAGES = new Set(["python", "javascript", "typescript", "java", "c", "cpp", "csharp", "go", "rust"]);

export function activate(context: vscode.ExtensionContext): void {
  const progress = new ProgressStore(context.globalState);
  const mentor = new MentorViewProvider(context, progress);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("seniorDevMentor.view", mentor, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("seniorDevMentor.focus", () => vscode.commands.executeCommand("seniorDevMentor.view.focus")),
    vscode.commands.registerCommand("seniorDevMentor.review", () => mentor.run("review")),
    vscode.commands.registerCommand("seniorDevMentor.hint", () => mentor.run("hint")),
    vscode.commands.registerCommand("seniorDevMentor.explainError", () => mentor.run("explainError")),
    vscode.commands.registerCommand("seniorDevMentor.newProblem", () => mentor.newProblem()),
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
      mentor.nudge(fresh.question, fresh.line, path.basename(doc.fileName));
    }),
  );
}

export function deactivate(): void {}
