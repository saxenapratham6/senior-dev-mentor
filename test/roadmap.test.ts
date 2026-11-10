import { test } from "node:test";
import assert from "node:assert/strict";
import { ROADMAP, emptyRoadmapState, toggleItem, addSolved, roadmapProgress, isRoadmapLink } from "../src/roadmap";
import { classifyRequest } from "../src/guardrails";

test("every roadmap item has a unique id and every link is allowed", () => {
  const ids = ROADMAP.flatMap((p) => p.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const p of ROADMAP) for (const i of p.items) if (i.url) assert.ok(isRoadmapLink(i.url), i.url);
  assert.equal(ROADMAP.find((p) => p.id === "p4")!.items.filter((i) => i.id.startsWith("p4-") && i.title !== "Grokking Dynamic Programming Interview in Python").length, 29, "29 Grokking patterns (the 30th module is the challenge set)");
});

test("progress follows checkboxes and points at the next step", () => {
  let s = emptyRoadmapState(0);
  let p = roadmapProgress(s);
  assert.equal(p.doneItems, 0);
  assert.equal(p.currentPhase, "p1", "the roadmap starts with Python foundations");
  assert.equal(p.next!.id, "p1-learn");

  for (const id of ["p1-learn", "p1-guide-a", "p1-quickcart"]) s = toggleItem(s, id);
  p = roadmapProgress(s);
  assert.equal(p.currentPhase, "p2", "a finished phase moves you on");
  assert.equal(p.phases[0].done, 3);

  s = toggleItem(s, "p1-learn");
  assert.equal(roadmapProgress(s).next!.id, "p1-learn", "unchecking goes back");
  assert.deepEqual(toggleItem(s, "made-up"), s, "unknown ids are ignored");

  const all = ROADMAP.flatMap((ph) => ph.items.map((i) => i.id)).reduce((st, id) => (st.done.includes(id) ? st : toggleItem(st, id)), s);
  const fin = roadmapProgress(all);
  assert.equal(fin.percent, 100);
  assert.equal(fin.currentPhase, null);
  assert.equal(fin.next, null);
});

test("solved counters never go negative and drive the milestones", () => {
  let s = addSolved(emptyRoadmapState(0), "easy", -1);
  assert.equal(s.solved.easy, 0);
  for (let i = 0; i < 149; i++) s = addSolved(s, "medium", 1);
  assert.equal(roadmapProgress(s).nextMilestone!.count, 150);
  s = addSolved(s, "hard", 1);
  assert.equal(roadmapProgress(s).solvedTotal, 150);
  assert.equal(roadmapProgress(s).nextMilestone!.count, 250);
});

test("links outside Educative and LeetCode are refused", () => {
  assert.equal(isRoadmapLink("https://www.educative.io/unlimited"), true);
  assert.equal(isRoadmapLink("http://www.educative.io/unlimited"), false);
  assert.equal(isRoadmapLink("https://evil.example.com/educative.io"), false);
  assert.equal(isRoadmapLink("javascript:alert(1)"), false);
});

test("every Python step has a study guide, and every step can be sent to Guide me", () => {
  for (const phase of ROADMAP.filter((p) => p.id === "p1" || p.id === "p2")) {
    for (const item of phase.items) {
      assert.ok(item.guide, `${item.id} has a guide`);
      assert.ok(item.guide!.focus.length >= 2 && item.guide!.checkpoints.length >= 2 && item.guide!.practice.length > 20, item.id);
      assert.doesNotMatch(JSON.stringify(item.guide), /```/, "guides contain no code blocks");
    }
  }
  for (const item of ROADMAP.flatMap((p) => p.items)) {
    assert.equal(classifyRequest(item.title).kind, "allowed", `"${item.title}" passes the request filter`);
  }
  assert.ok(!ROADMAP.some((p) => p.id === "p0"), "the access phase is gone");
});
