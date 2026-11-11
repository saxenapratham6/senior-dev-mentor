// The shape of a lesson. Lessons are plain data: text, code examples, quiz
// questions and practice exercises. Example outputs are not written by hand:
// `npm run lessons` runs every example with Python and saves what it prints
// to media/lesson-outputs.json, and a test fails if that file goes stale.

export interface Section {
  heading: string;
  /** Short paragraphs. `code` and **bold** are rendered; blank lines split paragraphs. */
  text: string;
  /** A runnable example. Students predict what it prints, then run it. */
  code?: string;
  /** Text after the example: what to notice once it has run. */
  after?: string;
}

export interface Compare {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface Pitfall {
  title: string;
  code: string;
  why: string;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface Exercise {
  id: string;
  title: string;
  /** What to build, in plain English. Shown on the board and at the top of the practice file. */
  prompt: string;
  /** Function stubs the student fills in. Bodies are `pass`, so every check fails at first. */
  starter: string;
  /** Python lines like `check("empty list", lambda: f([]), 0)`, run under `if __name__ == "__main__":`. */
  checks: string;
}

export type Difficulty = "easy" | "medium" | "hard";

export interface LadderProblem {
  name: string;
  difficulty: Difficulty;
}

export interface Lesson {
  id: string;
  unit: 1 | 2 | 3;
  title: string;
  minutes: number;
  /** What the panda says when the lesson opens. */
  summary: string;
  /** Patterns only: the clues in a problem statement that point to this pattern. */
  signals?: string[];
  sections: Section[];
  compare?: Compare;
  pitfalls?: Pitfall[];
  quiz: QuizQuestion[];
  exercises: Exercise[];
  /** Patterns only: LeetCode problems to solve on your own, easy to hard. */
  ladder?: LadderProblem[];
}

export const UNITS = {
  1: { title: "Python core", goal: "Know what your code really does: objects, types, and the data structures you'll use every day." },
  2: { title: "Python for problem solving", goal: "The tools and costs that decide whether a solution is fast enough." },
  3: { title: "Problem-solving patterns", goal: "Recognize the pattern behind a problem, then solve LeetCode from easy to hard on your own." },
} as const;

/** Every runnable piece of code in a lesson, in a stable order, with an id. */
export function examplesOf(lesson: Lesson): { id: string; code: string }[] {
  const out: { id: string; code: string }[] = [];
  lesson.sections.forEach((s, i) => s.code && out.push({ id: `${lesson.id}#s${i}`, code: s.code }));
  (lesson.pitfalls ?? []).forEach((p, i) => out.push({ id: `${lesson.id}#p${i}`, code: p.code }));
  return out;
}

export const CHECK_HELPER = `def check(name, run, want):
    try:
        got = run()
    except Exception as e:
        print(f"FAIL {name}: raised {type(e).__name__}: {e}")
        return
    if got == want:
        print(f"PASS {name}")
    else:
        print(f"FAIL {name}: got {got!r}, want {want!r}")`;

/** The practice file a student edits: the task as comments, the stubs, then the checks. */
export function practiceFile(lesson: Lesson, ex: Exercise): string {
  const prompt = ex.prompt
    .split("\n")
    .map((l) => (l.trim() ? `# ${l}` : "#"))
    .join("\n");
  const checks = ex.checks
    .replace(/^\n+|\s+$/g, "")
    .split("\n")
    .map((l) => (l.trim() ? `    ${l}` : ""))
    .join("\n");
  return `# ${lesson.title}: ${ex.title}
#
${prompt}
#
# Run this file to test your code (python3 ${ex.id}.py), or press Check on the
# panda's board. Make every check say PASS. Stuck? Ask the mentor for a Hint.

${ex.starter.trim()}


# ---- Checks (don't edit below this line) ----
${CHECK_HELPER}


if __name__ == "__main__":
${checks}
`;
}

/** Count PASS/FAIL lines printed by a practice file. */
export function parseCheckOutput(stdout: string): { passed: number; failed: number; lines: string[] } {
  const lines = stdout.split("\n").filter((l) => /^(PASS|FAIL) /.test(l));
  const passed = lines.filter((l) => l.startsWith("PASS")).length;
  return { passed, failed: lines.length - passed, lines };
}
