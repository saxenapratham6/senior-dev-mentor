// "Wrap up": at the end of a session (or a plan), the panda presents what
// happened. The numbers come from a deterministic session log; the model only
// writes the words, through a schema, and every line is guarded like chat.
import { z } from "zod";
import { guardText, GuardOptions, DEFAULT_GUARD } from "./guardrails";

export const SummarySchema = z.object({
  headline: z.string().describe("One warm, specific sentence about the session, in second person."),
  workedOn: z.array(z.string()).describe("What the student worked on, 1-4 short items."),
  figuredOut: z.array(z.string()).describe("Things the student worked out themselves, 0-4 items. Credit them, not the mentor."),
  stillFuzzy: z.array(z.string()).describe("Ideas that still seem shaky, phrased as questions to revisit, 0-3 items."),
  planCheck: z.string().describe("If the student checked a plan, how far they got with it and what's left. Empty string if no plan."),
  nextTime: z.array(z.string()).describe("1-3 concrete things to practice or try next session."),
});

export type Summary = z.infer<typeof SummarySchema>;

/** Facts recorded as the session goes, independent of the model. */
export interface SessionLog {
  startedAt: number;
  files: string[];
  events: { at: number; kind: string; detail: string }[];
  plans: string[];
  questions: number;
  reviews: number;
  hints: [number, number, number];
  quizzes: number;
  redirected: number;
  codeHidden: number;
  predictionsRight: number;
  predictionsTotal: number;
  visualized: string[];
  pandaStops: number;
  concepts: Record<string, number>;
}

export function newSessionLog(now = Date.now()): SessionLog {
  return {
    startedAt: now,
    files: [],
    events: [],
    plans: [],
    questions: 0,
    reviews: 0,
    hints: [0, 0, 0],
    quizzes: 0,
    redirected: 0,
    codeHidden: 0,
    predictionsRight: 0,
    predictionsTotal: 0,
    visualized: [],
    pandaStops: 0,
    concepts: {},
  };
}

export function isEmptySession(log: SessionLog): boolean {
  return !log.events.length && !log.predictionsTotal && !log.visualized.length;
}

/** The numbers shown on the wrap-up card. */
export function sessionStats(log: SessionLog, now = Date.now(), streakDays = 0) {
  const minutes = Math.max(1, Math.round((now - log.startedAt) / 60000));
  const topConcepts = Object.entries(log.concepts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([c]) => c);
  return {
    minutes,
    streakDays,
    questions: log.questions,
    reviews: log.reviews,
    plans: log.plans.length,
    hints: log.hints.reduce((a, b) => a + b, 0),
    hintsByLevel: log.hints,
    quizzes: log.quizzes,
    predictions: log.predictionsTotal ? `${log.predictionsRight}/${log.predictionsTotal}` : "",
    visualized: log.visualized.length,
    redirected: log.redirected,
    topConcepts,
  };
}

export type SessionStats = ReturnType<typeof sessionStats>;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function normalizeSummary(raw: unknown, guard: GuardOptions = DEFAULT_GUARD): Summary {
  const parsed = SummarySchema.safeParse(raw);
  if (!parsed.success) throw new Error("The wrap-up came back in the wrong shape. Try again.");
  const clean = (s: string) => guardText(clip(s.trim(), 260), guard).text.trim();
  const list = (xs: string[], n: number) => xs.map(clean).filter(Boolean).slice(0, n);
  const s = parsed.data;
  return {
    headline: clean(s.headline) || "Nice session.",
    workedOn: list(s.workedOn, 4),
    figuredOut: list(s.figuredOut, 4),
    stillFuzzy: list(s.stillFuzzy, 3),
    planCheck: clean(s.planCheck),
    nextTime: list(s.nextTime, 3),
  };
}

export function summaryPrompt(): string {
  return `You are the student's coding mentor, writing a short end-of-session wrap-up they will read and keep as notes.
- Second person, warm and specific. Refer to what actually happened; don't invent anything.
- Give the student the credit for what they worked out. If they asked for answers and were redirected, don't scold.
- "stillFuzzy" items are questions to revisit, not criticism.
- If they checked a plan, say which parts of it they got through, based on the conversation.
- No code, no solutions, no long explanations. Short items, at most about 20 words each.`;
}

/** Everything the model sees: the log as data, plus a trimmed transcript. */
export function summaryInput(log: SessionLog, transcript: { role: string; content: string }[]): string {
  const facts = {
    minutes: Math.round((Date.now() - log.startedAt) / 60000),
    files: log.files,
    plans: log.plans.map((p) => clip(p, 400)),
    counts: { questions: log.questions, reviews: log.reviews, hintsByLevel: log.hints, quizzes: log.quizzes, redirectedSolutionRequests: log.redirected },
    predictions: { right: log.predictionsRight, total: log.predictionsTotal },
    visualized: log.visualized,
    concepts: log.concepts,
    timeline: log.events.slice(-40).map((e) => `${new Date(e.at).toTimeString().slice(0, 5)} ${e.kind}${e.detail ? `: ${clip(e.detail, 120)}` : ""}`),
  };
  const convo = transcript
    .slice(-20)
    .map((t) => `${t.role.toUpperCase()}: ${clip(t.content.replace(/```[\s\S]*?```/g, "[code]"), 700)}`)
    .join("\n\n");
  return `Session facts (JSON):\n${JSON.stringify(facts, null, 1)}\n\nConversation (most recent last):\n${convo || "(no chat this session)"}`;
}

/** Markdown for "Save as notes". */
export function summaryMarkdown(s: Summary, stats: SessionStats, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const sec = (title: string, xs: string[]) => (xs.length ? `## ${title}\n\n${xs.map((x) => `- ${x}`).join("\n")}\n\n` : "");
  const numbers = [
    `${stats.minutes} min`,
    stats.reviews && plural(stats.reviews, "review", "reviews"),
    stats.plans && plural(stats.plans, "plan checked", "plans checked"),
    stats.hints && plural(stats.hints, "hint", "hints"),
    stats.quizzes && plural(stats.quizzes, "quiz", "quizzes"),
    stats.predictions && `predictions ${stats.predictions}`,
    stats.visualized && plural(stats.visualized, "thing visualized", "things visualized"),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    `# Mentor notes, ${day}\n\n${s.headline}\n\n_${numbers}_\n\n` +
    sec("What you worked on", s.workedOn) +
    sec("What you figured out", s.figuredOut) +
    (s.planCheck ? `## Your plan\n\n${s.planCheck}\n\n` : "") +
    sec("Still a bit fuzzy", s.stillFuzzy) +
    sec("Next time", s.nextTime) +
    (stats.topConcepts.length ? `Concepts: ${stats.topConcepts.join(", ")}\n` : "")
  );
}
