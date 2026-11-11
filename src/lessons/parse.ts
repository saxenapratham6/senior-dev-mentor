// Lessons are written as Markdown files in lessons/, one per lesson, so
// anyone can add or fix one without touching code. This turns a file into a
// Lesson. The format:
//
//   ---                         front matter: id, unit, title, minutes, summary
//   ## A heading                a section: paragraphs, plus an optional ```python block
//   ## Compare: Title           a Markdown table
//   ## Pitfall: Title           a ```python block, then the explanation
//   ## Signals                  bullet list (patterns)
//   ## Quiz                     ### questions, "- [ ]" / "- [x]" options, "Why: ..."
//   ## Exercise: id | Title     prompt, then ```python starter and ```python checks
//   ## Ladder                   "- easy: Problem Name" lines (patterns)
import type { Lesson, Section, Pitfall, QuizQuestion, Exercise, Compare, LadderProblem, Difficulty } from "./types";

interface Block {
  head: string;
  body: string[];
}

function fences(lines: string[]): { text: string; blocks: { info: string; code: string }[] } {
  const text: string[] = [];
  const blocks: { info: string; code: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^```(.*)$/);
    if (!open) {
      text.push(lines[i]);
      continue;
    }
    const code: string[] = [];
    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) code.push(lines[i]);
    blocks.push({ info: open[1].trim(), code: code.join("\n") });
    text.push("\u0000"); // marks where a block sat, so text before and after can be told apart
  }
  return { text: text.join("\n"), blocks };
}

const paragraphs = (s: string) =>
  s
    .replace(/\u0000/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");

export function parseLesson(source: string, file = "lesson"): Lesson {
  const fail = (msg: string): never => {
    throw new Error(`${file}: ${msg}`);
  };
  const fm = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) fail("missing front matter");
  const meta: Record<string, string> = {};
  for (const line of fm![1].split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
  for (const key of ["id", "unit", "title", "minutes", "summary"]) if (!meta[key]) fail(`front matter needs "${key}"`);

  const blocks: Block[] = [];
  for (const line of source.slice(fm![0].length).split("\n")) {
    const h = line.match(/^## (.+)$/);
    if (h) blocks.push({ head: h[1].trim(), body: [] });
    else if (blocks.length) blocks[blocks.length - 1].body.push(line);
  }

  const lesson: Lesson = {
    id: meta.id,
    unit: Number(meta.unit) as 1 | 2 | 3,
    title: meta.title,
    minutes: Number(meta.minutes),
    summary: meta.summary,
    sections: [],
    quiz: [],
    exercises: [],
  };
  const pitfalls: Pitfall[] = [];

  for (const b of blocks) {
    const { text, blocks: code } = fences(b.body);
    if (b.head.startsWith("Compare:")) {
      const rows = b.body
        .filter((l) => l.trim().startsWith("|"))
        .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
        .filter((r) => !r.every((c) => /^-+$/.test(c)));
      if (rows.length < 2) fail(`"${b.head}" needs a table`);
      lesson.compare = { title: b.head.slice(8).trim(), headers: rows[0], rows: rows.slice(1) } as Compare;
    } else if (b.head.startsWith("Pitfall:")) {
      if (!code[0]) fail(`"${b.head}" needs a code block`);
      pitfalls.push({ title: b.head.slice(8).trim(), code: code[0].code, why: paragraphs(text) });
    } else if (b.head === "Signals") {
      lesson.signals = b.body.filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());
    } else if (b.head === "Ladder") {
      lesson.ladder = b.body
        .map((l) => l.match(/^- (easy|medium|hard):\s*(.+)$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => ({ difficulty: m[1] as Difficulty, name: m[2].trim() }) as LadderProblem);
    } else if (b.head === "Quiz") {
      let q: QuizQuestion | null = null;
      for (const line of b.body) {
        const qm = line.match(/^### (.+)$/);
        const om = line.match(/^- \[( |x)\] (.+)$/);
        const wm = line.match(/^Why: (.+)$/);
        if (qm) {
          if (q) lesson.quiz.push(q);
          q = { q: qm[1].trim(), options: [], answer: -1, why: "" };
        } else if (om && q) {
          if (om[1] === "x") q.answer = q.options.length;
          q.options.push(om[2].trim());
        } else if (wm && q) q.why = wm[1].trim();
      }
      if (q) lesson.quiz.push(q);
      for (const qq of lesson.quiz) if (qq.answer < 0 || !qq.why) fail(`quiz question "${qq.q}" needs one [x] answer and a Why`);
    } else if (b.head.startsWith("Exercise:")) {
      const [id, title] = b.head.slice(9).split("|").map((s) => s.trim());
      const starter = code.find((c) => c.info === "python starter");
      const checks = code.find((c) => c.info === "python checks");
      if (!id || !title || !starter || !checks) fail(`"${b.head}" needs "id | title", a starter block and a checks block`);
      lesson.exercises.push({ id, title, prompt: paragraphs(text), starter: starter!.code, checks: checks!.code } as Exercise);
    } else {
      const [before, ...rest] = text.split("\u0000");
      const section: Section = { heading: b.head, text: paragraphs(before) };
      if (code[0]) {
        section.code = code[0].code;
        const after = paragraphs(rest.join("\n"));
        if (after) section.after = after;
      }
      lesson.sections.push(section);
    }
  }
  if (pitfalls.length) lesson.pitfalls = pitfalls;
  if (!lesson.sections.length) fail("needs at least one section");
  return lesson;
}
