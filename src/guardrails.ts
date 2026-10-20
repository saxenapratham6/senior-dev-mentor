// Deterministic guardrails. Nothing in this file calls a model: the same input
// always gives the same answer, so the "no full solutions" promise holds no
// matter what the model writes or how the student phrases the request.

export type RequestVerdict =
  | { kind: "allowed" }
  | { kind: "solution-request"; matched: string }
  | { kind: "override-attempt"; matched: string };

// Requests that hand the thinking to the AI. Each pattern names a delegation
// ("for me", "the whole thing", "just give me") rather than a topic, so
// learning questions like "how do I write a for loop?" stay allowed.
const SOLUTION_PATTERNS: RegExp[] = [
  /\b(write|code|implement|create|build|make|generate|finish|complete|solve|do|fix|debug|rewrite|redo|refactor)\b[^.?!]{0,40}\bfor me\b/i,
  /\b(give|send|show|tell|paste|provide)\s+(me\s+)?(the\s+|a\s+|your\s+)?(full|complete|entire|whole|working|final|correct|finished)?\s*(code|answer|solution|implementation|program|source)\b/i,
  /\b(full|complete|entire|whole|working|final|finished)\s+(code|solution|implementation|program|answer)\b/i,
  /\b(solve|finish|complete|do)\s+(this|it|that|my|the)\s*(problem|assignment|homework|hw|lab|mp|exercise|question|task|function|code)?\b(?!\s+(mean|means|work|works)\b)/i,
  /\b(write|implement|code)\s+(the|this|that|my)\s+(whole|entire|rest|remaining|function|method|class|program|solution|algorithm|code|assignment|mp|lab)\b/i,
  /\bwhat('?s| is)\s+the\s+(answer|solution)\b/i,
  /\bjust\s+(give|tell|show|write|fix|do)\b/i,
  /\bfix\s+(my|this|the)\s+code\b/i,
  /\bcopy[\s-]?(and[\s-]?)?paste\b/i,
  /\bdo\s+my\s+(homework|hw|assignment|lab|mp|project)\b/i,
];

const OVERRIDE_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+|any\s+|your\s+|the\s+|previous\s+|prior\s+|above\s+)*(instructions|rules|guardrails|prompt|restrictions)\b/i,
  /\b(you are|you're|act as)\s+(now\s+)?(a|an)?\s*(unrestricted|unfiltered|different|new)\b/i,
  /\bpretend\s+(you|to be|that)\b/i,
  /\b(developer|dev|god|jailbreak|dan)\s+mode\b/i,
  /\b(disable|turn off|bypass|remove)\s+(the\s+|your\s+)?(guardrails?|filters?|restrictions?|rules)\b/i,
  /\bsystem\s+prompt\b/i,
];

export function classifyRequest(text: string): RequestVerdict {
  for (const p of OVERRIDE_PATTERNS) {
    const m = text.match(p);
    if (m) return { kind: "override-attempt", matched: m[0] };
  }
  for (const p of SOLUTION_PATTERNS) {
    const m = text.match(p);
    if (m) return { kind: "solution-request", matched: m[0] };
  }
  return { kind: "allowed" };
}

// Shown instead of calling the model when a request is not allowed. Rotates
// by a caller-supplied counter, so it stays deterministic and testable.
const REDIRECTS = [
  "I won't write it for you, because then you'd learn how to ask me instead of how to code. Let's get you unstuck, though. In one sentence, what is your code supposed to do, and what does it do right now?",
  "That would be me doing the thinking for you. Try this: walk through your code by hand with the smallest input you can think of. Where does what you expected stop matching what happens?",
  "Let's not skip the good part. What have you tried so far? Paste or select your attempt and press **Review my attempt**, or press **Hint** for a nudge in the right direction.",
];

export function redirectMessage(verdict: RequestVerdict, counter: number): string {
  if (verdict.kind === "override-attempt") {
    return "Nice try! These rules aren't in the AI. They're plain code that runs before and after it, so there's nothing to talk around. I'm still happy to help you work it out yourself, though. What are you stuck on?";
  }
  return REDIRECTS[counter % REDIRECTS.length];
}

// ---------------------------------------------------------------------------
// Output filter: streams model text through, hiding code that is long enough
// to be a solution. Works line by line so it can run on a streaming response.

export interface GuardOptions {
  /** Longest fenced or unfenced code run (in lines) allowed through. */
  maxCodeLines: number;
  /** Longest code (in characters) allowed through, to stop one-line solutions. */
  maxCodeChars: number;
  /** Longest inline `code` span (in characters) allowed through. */
  maxInlineChars: number;
}

export const DEFAULT_GUARD: GuardOptions = { maxCodeLines: 3, maxCodeChars: 120, maxInlineChars: 60 };

export interface GuardStats {
  hiddenBlocks: number;
  hiddenLines: number;
}

const FENCE = /^\s*(```|~~~)/;
const LIST_OR_HEADING = /^\s*([-*+]\s|\d+[.)]\s|#{1,6}\s|>)/;
const CODE_START = /^\s*(def |class |for\s*\(|for \w+ in |while[\s(]|if\s*\(|elif |else\s*[:{]|return\b|import |from \S+ import |#include|public |private |protected |static |function\b|const |let |var |int |void |char |double |float |bool |std::|print\(|printf\(|console\.|System\.out|try\s*[:{]|catch\s*\(|except\b|switch\s*\(|case .*:$|\}|\{)/;
const CODE_END = /([;{}]|\)\s*:|^\s*\w+\s*=\s*[^=].*)\s*$/;

export function looksLikeCode(line: string): boolean {
  const t = line.trim();
  if (!t || LIST_OR_HEADING.test(line)) return false;
  return CODE_START.test(line) || CODE_END.test(t);
}

export class SolutionGuard {
  private partial = "";
  private inFence = false;
  private fenceOpen = "";
  private fenceLines: string[] = [];
  private loose: string[] = [];
  readonly stats: GuardStats = { hiddenBlocks: 0, hiddenLines: 0 };
  /** Concepts from the model's trailing "CONCEPTS: a, b" line, which is never shown. */
  concepts: string[] = [];

  constructor(private readonly opts: GuardOptions = DEFAULT_GUARD) {}

  /** Feed streamed text; returns the text that is now safe to show. */
  push(chunk: string): string {
    this.partial += chunk;
    let out = "";
    let nl: number;
    while ((nl = this.partial.indexOf("\n")) !== -1) {
      const line = this.partial.slice(0, nl);
      this.partial = this.partial.slice(nl + 1);
      out += this.line(line);
    }
    return out;
  }

  /** Flush at the end of the stream. */
  end(): string {
    let out = "";
    if (this.partial) {
      out += this.line(this.partial, true);
      this.partial = "";
    }
    if (this.inFence) out += this.closeFence("");
    out += this.flushLoose();
    return out;
  }

  private line(line: string, last = false): string {
    const nl = last ? "" : "\n";
    if (this.inFence) {
      if (FENCE.test(line)) return this.closeFence(line);
      this.fenceLines.push(line);
      return "";
    }
    if (CONCEPTS_LINE.test(line)) {
      this.concepts = parseConcepts(line.replace(CONCEPTS_LINE, ""));
      return "";
    }
    if (FENCE.test(line)) {
      const pending = this.flushLoose();
      this.inFence = true;
      this.fenceOpen = line;
      this.fenceLines = [];
      return pending;
    }
    if (looksLikeCode(line)) {
      this.loose.push(line);
      return "";
    }
    return this.flushLoose() + this.inline(line) + nl;
  }

  private closeFence(closeLine: string): string {
    const lines = this.fenceLines;
    this.inFence = false;
    this.fenceLines = [];
    const body = lines.filter((l) => l.trim()).length;
    const chars = lines.join("\n").length;
    if (body > this.opts.maxCodeLines || chars > this.opts.maxCodeChars) {
      return this.hidden(body);
    }
    return `${this.fenceOpen}\n${lines.join("\n")}${lines.length ? "\n" : ""}${closeLine || "```"}\n`;
  }

  private flushLoose(): string {
    if (!this.loose.length) return "";
    const lines = this.loose;
    this.loose = [];
    const chars = lines.join("\n").length;
    if (lines.length > this.opts.maxCodeLines || chars > this.opts.maxCodeChars) {
      return this.hidden(lines.length);
    }
    return lines.map((l) => this.inline(l)).join("\n") + "\n";
  }

  private inline(line: string): string {
    return line.replace(/`([^`\n]+)`/g, (whole, inner: string) => {
      if (inner.length <= this.opts.maxInlineChars) return whole;
      this.stats.hiddenBlocks++;
      return "`[code hidden]`";
    });
  }

  private hidden(lines: number): string {
    this.stats.hiddenBlocks++;
    this.stats.hiddenLines += lines;
    return `\n> **Code hidden by the guardrail.** The mentor wrote ${lines} line${lines === 1 ? "" : "s"} of code, more than the ${this.opts.maxCodeLines}-line limit, so it isn't shown. Try writing it yourself, then press **Review my attempt**.\n\n`;
  }
}

/** Convenience for non-streaming text. */
export function guardText(
  text: string,
  opts: GuardOptions = DEFAULT_GUARD,
): { text: string; stats: GuardStats; concepts: string[] } {
  const g = new SolutionGuard(opts);
  const out = g.push(text) + g.end();
  return { text: out, stats: g.stats, concepts: g.concepts };
}

// ---------------------------------------------------------------------------
// The model ends each answer with "CONCEPTS: a, b". The guard pulls that line
// out so the Progress tab can count concepts and the student never sees it.

const CONCEPTS_LINE = /^\s*\**CONCEPTS:\**\s*/i;

export function parseConcepts(list: string): string[] {
  return list
    .split(",")
    .map((c) => c.trim().toLowerCase().replace(/[.*_`]/g, ""))
    .filter((c) => c && c.length <= 40)
    .slice(0, 5);
}
