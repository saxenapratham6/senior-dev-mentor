import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { loadLessons, LessonOutputs } from "./lessons/index";
import { examplesOf, practiceFile, parseCheckOutput, Lesson, Exercise } from "./lessons/types";
import { runPython, RunResult } from "./lessons/run";
import { buildRoadmap, RoadmapPhase } from "./roadmap";

export interface CheckResult {
  passed: number;
  failed: number;
  lines: string[];
  error?: string;
  timedOut?: boolean;
  missing?: boolean;
}

/** The built-in lessons: content, runnable examples and practice files. */
export class Classroom {
  readonly lessons: Lesson[];
  readonly phases: RoadmapPhase[];
  private readonly outputs: LessonOutputs;

  constructor(private readonly ctx: vscode.ExtensionContext) {
    const root = ctx.extensionUri.fsPath;
    this.lessons = loadLessons(path.join(root, "lessons"));
    this.phases = buildRoadmap(this.lessons);
    try {
      this.outputs = JSON.parse(fs.readFileSync(path.join(root, "media", "lesson-outputs.json"), "utf8"));
    } catch {
      this.outputs = {};
    }
  }

  lesson(id: string): Lesson | undefined {
    return this.lessons.find((l) => l.id === id);
  }

  exercise(lessonId: string, exerciseId: string): { lesson: Lesson; exercise: Exercise } | undefined {
    const lesson = this.lesson(lessonId);
    const exercise = lesson?.exercises.find((e) => e.id === exerciseId);
    return lesson && exercise ? { lesson, exercise } : undefined;
  }

  neighbors(id: string): { prev?: { id: string; title: string }; next?: { id: string; title: string } } {
    const i = this.lessons.findIndex((l) => l.id === id);
    const pick = (l?: Lesson) => (l ? { id: l.id, title: l.title } : undefined);
    return { prev: pick(this.lessons[i - 1]), next: pick(this.lessons[i + 1]) };
  }

  /** Saved outputs for a lesson's examples, shown when Python isn't available. */
  savedOutputs(lesson: Lesson): LessonOutputs {
    const out: LessonOutputs = {};
    for (const ex of examplesOf(lesson)) if (this.outputs[ex.id]) out[ex.id] = this.outputs[ex.id];
    return out;
  }

  python(): string {
    const configured = vscode.workspace.getConfiguration("seniorDevMentor").get<string>("pythonPath", "").trim();
    return configured || (process.platform === "win32" ? "python" : "python3");
  }

  /** Run one lesson example. Falls back to the saved output if Python can't start. */
  async runExample(exampleId: string): Promise<RunResult & { saved?: boolean }> {
    const [lessonId] = exampleId.split("#");
    const lesson = this.lesson(lessonId);
    const ex = lesson && examplesOf(lesson).find((e) => e.id === exampleId);
    if (!ex) return { stdout: "", error: "Unknown example" };
    const r = await runPython(this.python(), ["-c", ex.code]);
    if (r.missing && this.outputs[exampleId]) return { ...this.outputs[exampleId], saved: true };
    return r;
  }

  /** Where practice files live: python-practice/ in the open folder, else the extension's storage. */
  private practiceDir(): vscode.Uri {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    return folder ? vscode.Uri.joinPath(folder, "python-practice") : vscode.Uri.joinPath(this.ctx.globalStorageUri, "python-practice");
  }

  practiceUri(exerciseId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.practiceDir(), `${exerciseId}.py`);
  }

  /** Create the practice file if it doesn't exist yet (never overwrite work), then open it. */
  async openExercise(lessonId: string, exerciseId: string, viewColumn?: vscode.ViewColumn): Promise<vscode.TextEditor | undefined> {
    const found = this.exercise(lessonId, exerciseId);
    if (!found) return undefined;
    const uri = this.practiceUri(exerciseId);
    if (!fs.existsSync(uri.fsPath)) {
      await vscode.workspace.fs.createDirectory(this.practiceDir());
      await vscode.workspace.fs.writeFile(uri, Buffer.from(practiceFile(found.lesson, found.exercise)));
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    return vscode.window.showTextDocument(doc, { viewColumn: viewColumn ?? vscode.ViewColumn.One, preview: false });
  }

  /** Save the practice file if it's open and run its checks. */
  async checkExercise(lessonId: string, exerciseId: string): Promise<CheckResult> {
    const uri = this.practiceUri(exerciseId);
    if (!fs.existsSync(uri.fsPath)) await this.openExercise(lessonId, exerciseId);
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (open?.isDirty) await open.save();
    const r = await runPython(this.python(), [uri.fsPath], 15000, path.dirname(uri.fsPath));
    return { ...parseCheckOutput(r.stdout), error: r.error, timedOut: r.timedOut, missing: r.missing };
  }

  /** Open a lesson example in a new, unsaved Python editor to play with. */
  async openExampleInEditor(exampleId: string): Promise<void> {
    const [lessonId] = exampleId.split("#");
    const lesson = this.lesson(lessonId);
    const ex = lesson && examplesOf(lesson).find((e) => e.id === exampleId);
    if (!ex) return;
    const doc = await vscode.workspace.openTextDocument({ language: "python", content: `# From the lesson "${lesson!.title}". Change it and run it!\n\n${ex.code}\n` });
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
  }
}
