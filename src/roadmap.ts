// The study roadmap: the built-in lessons (Python core, Python for problem
// solving, problem-solving patterns), then the courses and interview prep
// you're ready for afterwards. The plan is built from the lesson files;
// progress is saved in VS Code's global state, so it survives restarts.
import type { Lesson, Difficulty } from "./lessons/types";
import { UNITS } from "./lessons/types";

export interface RoadmapItem {
  id: string;
  title: string;
  detail?: string;
  minutes?: number;
  hours?: number;
  url?: string;
  /** Set for built-in lessons: the lesson to open. */
  lesson?: string;
  /** Exercise ids in the lesson, to show "1/2 exercises". */
  exercises?: string[];
  /** Number of LeetCode problems on the lesson's ladder. */
  ladder?: number;
}

export interface RoadmapPhase {
  id: string;
  title: string;
  weeks: string;
  goal: string;
  items: RoadmapItem[];
  tip?: string;
}

const EDU = "https://www.educative.io";
const search = (tab: "courses" | "paths", q: string) => `${EDU}/catalog/python?tab=${tab}&query=${encodeURIComponent(q)}`;

const UNIT_WEEKS = { 1: "Weeks 1–3", 2: "Weeks 4–5", 3: "Weeks 6–16" } as const;

/** Where to go once the lessons are done. */
const NEXT_STEPS: RoadmapItem[] = [
  { id: "next-grokking", title: "Grokking the Coding Interview Patterns in Python", detail: "Same patterns, many more problems. Do the first 8–10 of each pattern, easies first.", hours: 85, url: `${EDU}/courses/grokking-coding-interview-in-python` },
  { id: "next-grokking-dp", title: "Grokking Dynamic Programming Interview in Python", hours: 25, url: search("courses", "Grokking Dynamic Programming Interview in Python") },
  { id: "next-grind", title: "Grind 75 (timed review)", detail: "45 minutes per problem, explaining your approach out loud.", hours: 30, url: search("paths", "Grokking Grind 75") },
  { id: "next-contest", title: "A LeetCode weekly contest every week", url: "https://leetcode.com/contest/" },
  ...["Google", "Meta", "Apple", "Microsoft", "Netflix", "LinkedIn", "Oracle"].map((c) => ({
    id: `next-${c.toLowerCase()}`,
    title: `Speedrun the ${c} Coding Interview`,
    detail: "That company's top 50 problems, by pattern. Do it 2–3 weeks before the interview.",
    hours: 27,
    url: search("paths", `Speedrun the ${c}`),
  })),
  { id: "next-amazon", title: "Amazon: LeetCode's Amazon tag and the leadership principles", detail: "There's no Speedrun path for Amazon; the company tag needs LeetCode Premium.", url: "https://leetcode.com/problemset/" },
  { id: "next-behavioral", title: "Grokking the Behavioral Interview", url: search("courses", "Grokking the Behavioral Interview") },
  { id: "next-ood", title: "Grokking the Low Level Design Interview (object-oriented design rounds)", hours: 70, url: search("courses", "Grokking the Low Level Design Interview") },
];

export function buildRoadmap(lessons: Lesson[]): RoadmapPhase[] {
  const unitPhase = (unit: 1 | 2 | 3): RoadmapPhase => ({
    id: `unit${unit}`,
    title: UNITS[unit].title,
    weeks: UNIT_WEEKS[unit],
    goal: UNITS[unit].goal,
    items: lessons
      .filter((l) => l.unit === unit)
      .map((l) => ({
        id: `lesson:${l.id}`,
        title: l.title,
        minutes: l.minutes,
        lesson: l.id,
        exercises: l.exercises.map((e) => e.id),
        ladder: l.ladder?.length,
      })),
    tip: unit === 3 ? "For each pattern: read the lesson, do the exercise, then climb its LeetCode ladder from easy to hard. Use the mentor's Hint before reading any solution." : undefined,
  });
  return [
    unitPhase(1),
    unitPhase(2),
    unitPhase(3),
    {
      id: "next",
      title: "Ready for the courses",
      weeks: "Weeks 17+",
      goal: "You know the language and the patterns. Now build volume and speed, and prepare for specific companies.",
      items: NEXT_STEPS,
    },
  ];
}

export const PROBLEM_MILESTONES = [
  { count: 100, label: "after the pattern ladders" },
  { count: 200, label: "comfortable with mediums" },
  { count: 300, label: "interview-ready" },
];

export interface Solved {
  easy: number;
  medium: number;
  hard: number;
}

export interface RoadmapState {
  /** Finished roadmap items: `lesson:<id>` or a next-step id. */
  done: string[];
  solved: Solved;
  startedAt: number;
  /** Exercise ids whose checks all passed. */
  passed: string[];
  /** Ladder problems you've solved, as `<lesson id>/<problem name>`. */
  ladder: string[];
}

export const emptyRoadmapState = (now = Date.now()): RoadmapState => ({ done: [], solved: { easy: 0, medium: 0, hard: 0 }, startedAt: now, passed: [], ladder: [] });

const allItems = (phases: RoadmapPhase[]) => phases.flatMap((p) => p.items);

/** Toggle an item; unknown ids are ignored so a stale page can't store junk. */
export function toggleItem(state: RoadmapState, id: string, phases: RoadmapPhase[]): RoadmapState {
  if (!allItems(phases).some((i) => i.id === id)) return state;
  const done = state.done.includes(id) ? state.done.filter((d) => d !== id) : [...state.done, id];
  return { ...state, done };
}

export function addSolved(state: RoadmapState, difficulty: keyof Solved, delta: 1 | -1): RoadmapState {
  if (!(difficulty in state.solved)) return state;
  return { ...state, solved: { ...state.solved, [difficulty]: Math.max(0, state.solved[difficulty] + delta) } };
}

export function markPassed(state: RoadmapState, exerciseId: string): RoadmapState {
  return state.passed.includes(exerciseId) ? state : { ...state, passed: [...state.passed, exerciseId] };
}

/** Tick or untick a ladder problem; the solved counters follow. */
export function toggleLadder(state: RoadmapState, lessons: Lesson[], lessonId: string, name: string): RoadmapState {
  const problem = lessons.find((l) => l.id === lessonId)?.ladder?.find((p) => p.name === name);
  if (!problem) return state;
  const key = `${lessonId}/${name}`;
  const had = state.ladder.includes(key);
  const next = { ...state, ladder: had ? state.ladder.filter((k) => k !== key) : [...state.ladder, key] };
  return addSolved(next, problem.difficulty as Difficulty, had ? -1 : 1);
}

export interface RoadmapProgress {
  doneItems: number;
  totalItems: number;
  percent: number;
  phases: { id: string; done: number; total: number }[];
  /** The phase with the first unfinished item, or null when everything is done. */
  currentPhase: string | null;
  next: RoadmapItem | null;
  solvedTotal: number;
  nextMilestone: (typeof PROBLEM_MILESTONES)[number] | null;
}

export function roadmapProgress(state: RoadmapState, phases: RoadmapPhase[]): RoadmapProgress {
  const done = new Set(state.done);
  const counts = phases.map((p) => ({ id: p.id, done: p.items.filter((i) => done.has(i.id)).length, total: p.items.length }));
  const totalItems = counts.reduce((a, p) => a + p.total, 0);
  const doneItems = counts.reduce((a, p) => a + p.done, 0);
  let currentPhase: string | null = null;
  let next: RoadmapItem | null = null;
  for (const p of phases) {
    const item = p.items.find((i) => !done.has(i.id));
    if (item) {
      currentPhase = p.id;
      next = item;
      break;
    }
  }
  const solvedTotal = state.solved.easy + state.solved.medium + state.solved.hard;
  return {
    doneItems,
    totalItems,
    percent: totalItems ? Math.round((100 * doneItems) / totalItems) : 0,
    phases: counts,
    currentPhase,
    next,
    solvedTotal,
    nextMilestone: PROBLEM_MILESTONES.find((m) => m.count > solvedTotal) ?? null,
  };
}

/** LeetCode's URL slug for a problem title. */
export function leetcodeUrl(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[()',]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://leetcode.com/problems/${slug}/`;
}

/** Only these hosts can be opened from the roadmap's links. */
export function isRoadmapLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ["www.educative.io", "educative.io", "leetcode.com"].includes(u.hostname);
  } catch {
    return false;
  }
}
