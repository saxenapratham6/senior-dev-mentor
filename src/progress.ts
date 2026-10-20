import * as vscode from "vscode";

export interface Progress {
  questions: number;
  reviews: number;
  hintsByLevel: [number, number, number];
  solutionRequestsRedirected: number;
  codeHidden: number;
  plansChecked: number;
  quizzes: number;
  visualizations: number;
  predictionsRight: number;
  predictionsTotal: number;
  concepts: Record<string, number>;
  activeDays: string[]; // YYYY-MM-DD, most recent last
}

const KEY = "seniorDevMentor.progress";

const empty = (): Progress => ({
  questions: 0,
  reviews: 0,
  hintsByLevel: [0, 0, 0],
  solutionRequestsRedirected: 0,
  codeHidden: 0,
  plansChecked: 0,
  quizzes: 0,
  visualizations: 0,
  predictionsRight: 0,
  predictionsTotal: 0,
  concepts: {},
  activeDays: [],
});

export class ProgressStore {
  constructor(private readonly state: vscode.Memento) {}

  get(): Progress {
    return { ...empty(), ...this.state.get<Progress>(KEY) };
  }

  async update(fn: (p: Progress) => void): Promise<Progress> {
    const p = this.get();
    fn(p);
    const today = new Date().toISOString().slice(0, 10);
    if (p.activeDays[p.activeDays.length - 1] !== today) p.activeDays = [...p.activeDays, today].slice(-60);
    await this.state.update(KEY, p);
    return p;
  }

  async reset(): Promise<Progress> {
    await this.state.update(KEY, undefined);
    return this.get();
  }
}

/** Consecutive days with activity, ending today or yesterday. */
export function streak(days: string[]): number {
  const set = new Set(days);
  const d = new Date();
  if (!set.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
