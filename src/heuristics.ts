// Cheap, deterministic observations run when a file is saved. Each one is a
// question for the student, never a fix, and no AI is involved.

export interface Nudge {
  line: number; // 0-based
  question: string;
  concept: string;
}

const LOOP = /^\s*(for|while)\b|\.forEach\(|\bfor\s*\(/;

export function findNudges(text: string): Nudge[] {
  const lines = text.split(/\r?\n/);
  const nudges: Nudge[] = [];
  const indentOf = (l: string) => l.match(/^\s*/)![0].replace(/\t/g, "    ").length;

  // Nested loops: a chance to talk about time complexity.
  const loopStack: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const ind = indentOf(l);
    while (loopStack.length && ind <= indentOf(lines[loopStack[loopStack.length - 1]])) loopStack.pop();
    if (LOOP.test(l)) {
      if (loopStack.length >= 1) {
        nudges.push({
          line: i,
          concept: "time complexity",
          question: "This loop runs inside another loop. If the input doubles in size, roughly how much longer will this take? Is there a way to avoid the inner loop?",
        });
        break;
      }
      loopStack.push(i);
    }
  }

  // `while True` / `while (true)` without an obvious exit.
  const body = lines.join("\n");
  const inf = lines.findIndex((l) => /^\s*while\s*\(?\s*(True|true|1)\s*\)?\s*[:{]/.test(l));
  if (inf !== -1 && !/\b(break|return)\b/.test(body.slice(body.indexOf(lines[inf])))) {
    nudges.push({ line: inf, concept: "loop termination", question: "How does this loop ever stop? Walk through what has to happen for it to exit." });
  }

  // Recursion without an obvious base case (Python and C-like functions).
  const fn = /^\s*(?:def\s+(\w+)\s*\(|(?:function\s+|(?:public|private|static|int|void|bool|double|auto|long)\s+[\w<>[\]]*\s*)(\w+)\s*\()/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(fn);
    const name = m?.[1] ?? m?.[2];
    if (!name) continue;
    const ind = indentOf(lines[i]);
    const fnBody = lines.slice(i + 1, blockEnd(lines, i, ind, indentOf)).join("\n");
    const callsSelf = new RegExp(`\\b${name}\\s*\\(`).test(fnBody);
    if (callsSelf && !/\bif\b/.test(fnBody)) {
      nudges.push({ line: i, concept: "recursion", question: `\`${name}\` calls itself. What is the base case, the input where it stops calling itself?` });
    }
  }

  // Very long functions.
  if (lines.length > 0) {
    let start = -1;
    for (let i = 0; i <= lines.length; i++) {
      const isFn = i < lines.length && fn.test(lines[i]);
      if (isFn || i === lines.length) {
        if (start !== -1 && i - start > 60) {
          nudges.push({ line: start, concept: "decomposition", question: "This function is over 60 lines. Could you describe what it does in one sentence? If not, which parts could be their own functions?" });
          break;
        }
        start = i;
      }
    }
  }

  // Bare except / empty catch: swallowing errors.
  const swallow = lines.findIndex((l, i) => /^\s*except\s*:/.test(l) || (/catch\s*\(.*\)\s*\{\s*\}?\s*$/.test(l) && /^\s*\}?\s*$/.test(lines[i + 1] ?? "")));
  if (swallow !== -1) {
    nudges.push({ line: swallow, concept: "error handling", question: "What happens to the error caught here? If something goes wrong, how would you find out?" });
  }

  return nudges;
}

/** Index just past the block that starts on line `start`: braces if it opens one, else indentation. */
function blockEnd(lines: string[], start: number, ind: number, indentOf: (l: string) => number): number {
  if (/\{\s*$/.test(lines[start]) || /^\s*\{/.test(lines[start + 1] ?? "")) {
    let depth = 0;
    for (let j = start; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") depth++;
        else if (ch === "}" && --depth === 0) return j + 1;
      }
    }
    return lines.length;
  }
  let j = start + 1;
  while (j < lines.length && (!lines[j].trim() || indentOf(lines[j]) > ind)) j++;
  return j;
}
