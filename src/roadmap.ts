// The study roadmap: from Python basics to company-specific interview prep,
// built from Educative's catalog (checked November 2026). The plan is data;
// progress is saved in VS Code's global state, so it survives restarts.

export interface RoadmapItem {
  id: string;
  title: string;
  detail?: string;
  hours?: number;
  url?: string;
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
const GROKKING = `${EDU}/courses/grokking-coding-interview-in-python`;

const pattern = (id: string, title: string): RoadmapItem => ({
  id: `p4-${id}`,
  title,
  detail: "Intro, then the first 8–10 problems: easies first, then mediums. Re-solve them on LeetCode.",
  url: GROKKING,
});

export const ROADMAP: RoadmapPhase[] = [
  {
    id: "p0",
    title: "Get access",
    weeks: "Day 1",
    goal: "Unlock the courses as cheaply as possible.",
    items: [
      { id: "p0-github", title: "Claim the GitHub Student Pack offer", detail: "6 months free on 70+ courses, plus 30% off paid plans.", url: `${EDU}/github-students` },
      { id: "p0-standard", title: "Get the Standard plan", detail: "Includes every Grokking course. Compare the student discount with any sale at checkout.", url: `${EDU}/unlimited` },
    ],
    tip: "Wait to upgrade to Premium (AI mock interviews) until Phase 6.",
  },
  {
    id: "p1",
    title: "Python foundations",
    weeks: "Weeks 1–3",
    goal: "Write everyday Python without looking things up.",
    items: [
      { id: "p1-learn", title: "Learn Python 3 (free)", detail: "Skip it if classes, loops and dictionaries already feel easy.", hours: 10, url: search("courses", "Learn Python 3 Free Interactive Course") },
      { id: "p1-guide-a", title: "Comprehensive Guide, modules 1–11", detail: "Types, flow control, collections, functions, comprehensions, object model, classes.", hours: 8, url: `${EDU}/courses/learn-python-3-complete-guide` },
      { id: "p1-quickcart", title: "Project: QuickCart inventory manager", url: `${EDU}/courses/learn-python-3-complete-guide` },
    ],
  },
  {
    id: "p2",
    title: "Python mastery",
    weeks: "Weeks 4–6",
    goal: "Know the language deeply, and the tools LeetCode in Python relies on.",
    items: [
      { id: "p2-guide-b", title: "Comprehensive Guide, modules 12–22", detail: "Errors, testing, generators, concurrency, async, decorators, metaprogramming, packaging.", hours: 8, url: `${EDU}/courses/learn-python-3-complete-guide` },
      { id: "p2-projects", title: "Projects: BiblioTech and FactStorm CLI", url: `${EDU}/courses/learn-python-3-complete-guide` },
      { id: "p2-201", title: "Python 201", detail: "The standard library in depth.", hours: 11, url: search("courses", "Python 201") },
      { id: "p2-teasers", title: "Python Brain Teasers (checkpoint)", hours: 1.5, url: search("courses", "Python Brain Teasers") },
      { id: "p2-toolkit", title: "Drill the interview toolkit", detail: "collections (deque, Counter, defaultdict), heapq, bisect, itertools, functools.cache, sorted(key=…), slicing, string methods." },
    ],
  },
  {
    id: "p3",
    title: "Data structures and algorithms",
    weeks: "Weeks 7–10",
    goal: "The first four modules of the Ace the Python Coding Interview path.",
    items: [
      { id: "p3-bigo", title: "Big-O Notation", hours: 10, url: `${EDU}/path/ace-python-coding-interview` },
      { id: "p3-ds", title: "Data Structures for Coding Interviews", hours: 30, url: `${EDU}/path/ace-python-coding-interview` },
      { id: "p3-algo", title: "Algorithms for Coding Interviews in Python", hours: 15, url: `${EDU}/path/ace-python-coding-interview` },
      { id: "p3-rec", title: "Recursion", url: `${EDU}/path/ace-python-coding-interview` },
    ],
  },
  {
    id: "p4",
    title: "Grokking the coding patterns",
    weeks: "Weeks 11–22",
    goal: "Recognize the pattern behind a problem. Course: Grokking the Coding Interview Patterns in Python.",
    tip: "Don't do all 1,100+ lessons. Leave hards for a second pass.",
    items: [
      pattern("two-pointers", "Two Pointers"),
      pattern("fast-slow", "Fast & Slow Pointers"),
      pattern("sliding-window", "Sliding Window"),
      pattern("hash-maps", "Hash Maps"),
      pattern("tracking", "Knowing What to Track"),
      pattern("stacks", "Stacks"),
      pattern("mono-stack", "Monotonic Stack"),
      pattern("matrices", "Matrices"),
      pattern("intervals", "Intervals"),
      pattern("linked-list", "In-Place Manipulation of a Linked List"),
      pattern("binary-search", "Modified Binary Search"),
      pattern("sort-search", "Sort and Search"),
      pattern("cyclic-sort", "Cyclic Sort"),
      pattern("tree-dfs", "Tree Depth-First Search"),
      pattern("tree-bfs", "Tree Breadth-First Search"),
      pattern("trie", "Trie"),
      pattern("two-heaps", "Two Heaps"),
      pattern("top-k", "Top K Elements"),
      pattern("k-way", "K-way Merge"),
      pattern("graphs", "Graphs"),
      pattern("topo-sort", "Topological Sort"),
      pattern("union-find", "Union Find"),
      pattern("subsets", "Subsets"),
      pattern("backtracking", "Backtracking"),
      pattern("greedy", "Greedy Techniques"),
      pattern("dp", "Dynamic Programming"),
      { id: "p4-grokking-dp", title: "Grokking Dynamic Programming Interview in Python", detail: "Alongside the DP pattern.", hours: 25, url: search("courses", "Grokking Dynamic Programming Interview in Python") },
      pattern("bitwise", "Bitwise Manipulation"),
      pattern("math", "Math and Geometry"),
      pattern("custom-ds", "Custom Data Structures"),
    ],
  },
  {
    id: "p5",
    title: "Consolidate",
    weeks: "Weeks 23–25",
    goal: "Timed review of the classic lists.",
    items: [
      { id: "p5-grind", title: "Grokking Grind 75 in Python", detail: "45 minutes per problem, explaining out loud.", hours: 30, url: search("paths", "Grokking Grind 75") },
      { id: "p5-blind", title: "Grokking the Blind 75: only the problems you haven't seen", hours: 30, url: search("paths", "Grokking the Blind 75") },
      { id: "p5-hards", title: "Second pass: the hard problems from Phase 4", url: GROKKING },
      { id: "p5-contest", title: "One LeetCode weekly contest a week", url: "https://leetcode.com/contest/" },
    ],
  },
  {
    id: "p6",
    title: "Company-specific",
    weeks: "2–3 weeks before each interview",
    goal: "Each Speedrun path is a company's top 50 problems, grouped by pattern (27 hours). Do your target's, then skim the rest.",
    items: [
      ...["Google", "Meta", "Apple", "Microsoft", "Netflix", "LinkedIn", "Oracle"].map((c) => ({
        id: `p6-${c.toLowerCase()}`,
        title: `Speedrun the ${c} Coding Interview`,
        hours: 27,
        url: search("paths", `Speedrun the ${c}`),
      })),
      { id: "p6-amazon", title: "Amazon: LeetCode's Amazon tag + leadership principles", detail: "No Speedrun path for Amazon. The company tag needs LeetCode Premium.", url: "https://leetcode.com/problemset/" },
      { id: "p6-behavioral", title: "Grokking the Behavioral Interview", url: search("courses", "Grokking the Behavioral Interview") },
      { id: "p6-ood", title: "Grokking the Low Level Design Interview (OOD rounds)", hours: 70, url: search("courses", "Grokking the Low Level Design Interview") },
      { id: "p6-mocks", title: "AI mock interviews (Premium, 3 a month)", url: `${EDU}/unlimited` },
    ],
  },
];

export const PROBLEM_MILESTONES = [
  { count: 150, label: "by week 16" },
  { count: 250, label: "by week 22" },
  { count: 300, label: "interview-ready" },
];

export interface Solved {
  easy: number;
  medium: number;
  hard: number;
}

export interface RoadmapState {
  done: string[];
  solved: Solved;
  startedAt: number;
}

export const emptyRoadmapState = (now = Date.now()): RoadmapState => ({ done: [], solved: { easy: 0, medium: 0, hard: 0 }, startedAt: now });

/** Toggle an item; unknown ids are ignored so a stale page can't store junk. */
export function toggleItem(state: RoadmapState, id: string): RoadmapState {
  if (!ROADMAP.some((p) => p.items.some((i) => i.id === id))) return state;
  const done = state.done.includes(id) ? state.done.filter((d) => d !== id) : [...state.done, id];
  return { ...state, done };
}

export function addSolved(state: RoadmapState, difficulty: keyof Solved, delta: 1 | -1): RoadmapState {
  if (!(difficulty in state.solved)) return state;
  return { ...state, solved: { ...state.solved, [difficulty]: Math.max(0, state.solved[difficulty] + delta) } };
}

export interface RoadmapProgress {
  doneItems: number;
  totalItems: number;
  percent: number;
  phases: { id: string; done: number; total: number }[];
  /** The phase with the first unchecked item, or null when everything is done. */
  currentPhase: string | null;
  next: RoadmapItem | null;
  solvedTotal: number;
  nextMilestone: (typeof PROBLEM_MILESTONES)[number] | null;
}

export function roadmapProgress(state: RoadmapState): RoadmapProgress {
  const done = new Set(state.done);
  const phases = ROADMAP.map((p) => ({ id: p.id, done: p.items.filter((i) => done.has(i.id)).length, total: p.items.length }));
  const totalItems = phases.reduce((a, p) => a + p.total, 0);
  const doneItems = phases.reduce((a, p) => a + p.done, 0);
  let currentPhase: string | null = null;
  let next: RoadmapItem | null = null;
  for (const p of ROADMAP) {
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
    phases,
    currentPhase,
    next,
    solvedTotal,
    nextMilestone: PROBLEM_MILESTONES.find((m) => m.count > solvedTotal) ?? null,
  };
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
