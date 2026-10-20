// The hint ladder decides, without asking a model, how much help a student
// gets. Each rung needs proof of effort since the last one: the code changed,
// or the student wrote down what they tried. There is no rung with the answer.

export const HINT_LEVELS = [
  {
    name: "Nudge",
    instruction:
      "Give ONE guiding question that points at where to look next. No explanation, no code, no names of the fix.",
  },
  {
    name: "Concept",
    instruction:
      "Name the concept or pattern they need and explain it in general terms with a tiny example that is NOT their problem. Do not apply it to their code.",
  },
  {
    name: "Plan",
    instruction:
      "Give a numbered plan of 3-6 plain-English steps for their approach. No code and no pseudocode that maps one-to-one onto lines of their language.",
  },
] as const;

export const MIN_REFLECTION_CHARS = 30;

export type HintDecision =
  | { ok: true; level: number; name: string; instruction: string }
  | { ok: false; reason: "needs-effort" | "ladder-done"; message: string };

interface LadderState {
  level: number; // next level to hand out
  lastCodeHash: string | null;
}

export class HintLadder {
  private states = new Map<string, LadderState>();

  /** Ask for the next hint on a problem (usually keyed by file). */
  request(problemKey: string, codeHash: string, reflection: string): HintDecision {
    const s = this.states.get(problemKey) ?? { level: 0, lastCodeHash: null };

    if (s.level >= HINT_LEVELS.length) {
      return {
        ok: false,
        reason: "ladder-done",
        message:
          "You've had every hint for this problem: a nudge, the concept and a plan. The last step is yours. Write the code, then press **Review my attempt** and I'll ask you questions about it. (Press **New problem** to start over on something else.)",
      };
    }

    const codeChanged = s.lastCodeHash !== null && s.lastCodeHash !== codeHash;
    const reflected = reflection.trim().length >= MIN_REFLECTION_CHARS;
    if (s.level > 0 && !codeChanged && !reflected) {
      return {
        ok: false,
        reason: "needs-effort",
        message: `Before the next hint, show me some thinking: change your code, or write a sentence or two (at least ${MIN_REFLECTION_CHARS} characters) about what you tried and what you think is going wrong.`,
      };
    }

    const level = s.level;
    this.states.set(problemKey, { level: level + 1, lastCodeHash: codeHash });
    return { ok: true, level, ...HINT_LEVELS[level] };
  }

  /** Which rung a problem is on, for the UI. */
  levelOf(problemKey: string): number {
    return this.states.get(problemKey)?.level ?? 0;
  }

  reset(problemKey?: string): void {
    if (problemKey) this.states.delete(problemKey);
    else this.states.clear();
  }
}

/** Small, stable string hash (FNV-1a) so we can tell whether code changed. */
export function hashCode(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
