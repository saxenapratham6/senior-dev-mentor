import * as vscode from "vscode";
import * as path from "path";

const MAX_LINES = 300;

export interface CodeContext {
  fileName: string;
  languageId: string;
  /** Code shown to the mentor: the selection, or a window around the cursor. */
  code: string;
  firstLine: number; // 1-based
  /** Whole document text, used to tell whether the student changed anything. */
  fullText: string;
  problemKey: string;
  diagnostics: string[];
  /** 0-based lines of those diagnostics, closest to the cursor first. */
  diagnosticLines: number[];
  cursorLine: number; // 1-based
}

export function codeContext(editor: vscode.TextEditor | undefined): CodeContext | undefined {
  if (!editor) return undefined;
  const doc = editor.document;
  const sel = editor.selection;
  let start: number;
  let end: number;
  if (!sel.isEmpty) {
    start = sel.start.line;
    end = sel.end.line;
  } else if (doc.lineCount <= MAX_LINES) {
    start = 0;
    end = doc.lineCount - 1;
  } else {
    start = Math.max(0, sel.active.line - MAX_LINES / 2);
    end = Math.min(doc.lineCount - 1, start + MAX_LINES - 1);
  }
  const code = doc.getText(new vscode.Range(start, 0, end, doc.lineAt(end).text.length));

  const nearest = vscode.languages
    .getDiagnostics(doc.uri)
    .filter((d) => d.severity <= vscode.DiagnosticSeverity.Warning)
    .sort((a, b) => Math.abs(a.range.start.line - sel.active.line) - Math.abs(b.range.start.line - sel.active.line))
    .slice(0, 5);
  const diagnostics = nearest.map((d) => `line ${d.range.start.line + 1}: ${d.message}`);

  return {
    fileName: path.basename(doc.fileName),
    languageId: doc.languageId,
    code,
    firstLine: start + 1,
    fullText: doc.getText(),
    problemKey: doc.uri.toString(),
    diagnostics,
    diagnosticLines: nearest.map((d) => d.range.start.line),
    cursorLine: sel.active.line + 1,
  };
}

/** The code block we attach to a request, with line numbers so the mentor can point at lines. */
export function formatContext(ctx: CodeContext): string {
  const numbered = ctx.code
    .split("\n")
    .map((l, i) => `${String(ctx.firstLine + i).padStart(4)} | ${l}`)
    .join("\n");
  let out = `My file \`${ctx.fileName}\` (${ctx.languageId}), cursor on line ${ctx.cursorLine}:\n\`\`\`${ctx.languageId}\n${numbered}\n\`\`\``;
  if (ctx.diagnostics.length) out += `\nErrors/warnings from the editor:\n${ctx.diagnostics.map((d) => `- ${d}`).join("\n")}`;
  return out;
}
