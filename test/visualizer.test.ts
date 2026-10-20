import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";

// Load the webview script with a stub window and pull out the generators.
const win: Record<string, any> = {};
vm.runInNewContext(readFileSync(path.join(__dirname, "../media/visualizer.js"), "utf8"), { window: win });
const ALGOS = win.Visualizer.ALGOS;

function run(name: string, input: number[], target?: number) {
  const a = input.slice();
  const steps = [...ALGOS[name](a, target)];
  return { a, steps };
}

test("every sort leaves the array sorted, and every prediction has a valid answer", () => {
  for (let trial = 0; trial < 200; trial++) {
    const input = Array.from({ length: 2 + (trial % 20) }, () => Math.floor(Math.random() * 30));
    const expected = input.slice().sort((x, y) => x - y);
    for (const name of ["bubble", "selection", "insertion", "merge", "quick"]) {
      const { a, steps } = run(name, input);
      assert.deepEqual(a, expected, `${name} on ${input}`);
      for (const s of steps) if (s.q) assert.ok(s.q.answer >= 0 && s.q.answer < s.q.options.length);
    }
  }
});

test("replaying the visible steps reproduces the sorted array", () => {
  // The picture is built only from swap/set steps, so they must tell the whole story.
  for (const name of ["bubble", "selection", "insertion", "merge", "quick"]) {
    const input = [5, 3, 8, 1, 9, 2, 7, 3];
    const view = input.slice();
    for (const s of run(name, input).steps) {
      if (s.type === "swap") [view[s.i], view[s.j]] = [view[s.j], view[s.i]];
      if (s.type === "set") view[s.i] = s.value;
    }
    assert.deepEqual(view, input.slice().sort((x, y) => x - y), name);
  }
});

test("binary search finds present targets and reports missing ones", () => {
  const a = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
  for (const t of a) {
    const { steps } = run("binary", a, t);
    const found = steps.find((s: any) => s.type === "sorted");
    assert.equal(a[found.idx[0]], t);
  }
  const miss = run("binary", a, 40).steps;
  assert.ok(!miss.some((s: any) => s.type === "sorted"));
});
