import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadLessons } from "../src/lessons/index";
import { buildRoadmap, emptyRoadmapState, toggleItem, addSolved, toggleLadder, markPassed, roadmapProgress, isRoadmapLink, leetcodeUrl } from "../src/roadmap";
import { classifyRequest } from "../src/guardrails";

const lessons = loadLessons(path.join(__dirname, "..", "lessons"));
const phases = buildRoadmap(lessons);

test("the roadmap is the three lesson units, then the courses", () => {
  assert.deepEqual(phases.map((p) => p.id), ["unit1", "unit2", "unit3", "next"]);
  assert.deepEqual(phases.slice(0, 3).map((p) => p.items.length), [10, 6, 13]);
  assert.ok(phases[0].items.every((i) => i.lesson && !i.url), "lessons are built in, not links");
  const ids = phases.flatMap((p) => p.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const i of phases.flatMap((p) => p.items)) {
    if (i.url) assert.ok(isRoadmapLink(i.url), i.url);
    assert.equal(classifyRequest(i.title).kind, "allowed", `"${i.title}" passes the request filter`);
  }
});

test("progress follows finished lessons and points at the next one", () => {
  let s = emptyRoadmapState(0);
  let p = roadmapProgress(s, phases);
  assert.equal(p.currentPhase, "unit1");
  assert.equal(p.next!.id, "lesson:names-and-objects");

  for (const item of phases[0].items) s = toggleItem(s, item.id, phases);
  p = roadmapProgress(s, phases);
  assert.equal(p.currentPhase, "unit2", "finishing Unit 1 moves you on");
  assert.equal(p.phases[0].done, 10);

  s = toggleItem(s, "lesson:names-and-objects", phases);
  assert.equal(roadmapProgress(s, phases).next!.id, "lesson:names-and-objects", "unchecking goes back");
  assert.deepEqual(toggleItem(s, "made-up", phases), s, "unknown ids are ignored");
});

test("ladder problems drive the solved counters", () => {
  let s = emptyRoadmapState(0);
  s = toggleLadder(s, lessons, "two-pointers", "3Sum");
  s = toggleLadder(s, lessons, "two-pointers", "Trapping Rain Water");
  assert.deepEqual(s.solved, { easy: 0, medium: 1, hard: 1 });
  s = toggleLadder(s, lessons, "two-pointers", "3Sum");
  assert.deepEqual(s.solved, { easy: 0, medium: 0, hard: 1 }, "unticking takes it back off");
  assert.deepEqual(toggleLadder(s, lessons, "two-pointers", "Not A Problem"), s, "unknown problems are ignored");
  assert.equal(addSolved(emptyRoadmapState(0), "easy", -1).solved.easy, 0, "counters never go negative");
});

test("passed exercises are recorded once", () => {
  const s = markPassed(markPassed(emptyRoadmapState(0), "spiral"), "spiral");
  assert.deepEqual(s.passed, ["spiral"]);
});

test("LeetCode links use LeetCode's slugs and only safe hosts open", () => {
  assert.equal(leetcodeUrl("Two Sum II - Input Array Is Sorted"), "https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/");
  assert.equal(leetcodeUrl("Implement Trie (Prefix Tree)"), "https://leetcode.com/problems/implement-trie-prefix-tree/");
  assert.equal(isRoadmapLink("https://evil.example.com/educative.io"), false);
  assert.equal(isRoadmapLink("javascript:alert(1)"), false);
});
