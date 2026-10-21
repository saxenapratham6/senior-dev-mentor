import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { normalizeScene, SceneSchema, Scene } from "../src/scene";
import { placePanda, visualWidth, pandaCss, bubbleCss } from "../src/pandaPlacement";
import { normalizeSummary, newSessionLog, sessionStats, summaryMarkdown, summaryInput, isEmptySession } from "../src/summary";

// The webview scripts, loaded with a stub window.
const win: Record<string, any> = {};
const ctx = { window: win };
for (const f of ["visualizer.js", "scene.js"]) vm.runInNewContext(readFileSync(path.join(__dirname, "../media", f), "utf8"), ctx);
const player = win.ScenePlayer;

test("the panda sits clear of nearby code and keeps its bubble on screen", () => {
  const lines = ["def f(xs):", "    total = 0", "    for x in xs:", "        total += x * x  # the longest line here", "    return total"];
  const p = placePanda(lines, 2, 0, 4);
  // Two cells past the widest line within reach, measured from line 2's end.
  assert.equal(p.lineCh + p.offsetCh, visualWidth(lines[3], 4) + 2);
  assert.equal(p.bubbleBelow, true, "near the top of the screen the bubble goes below");
  assert.equal(placePanda(lines, 2, -10, 4).bubbleBelow, false);
  assert.equal(visualWidth("\tx", 4), 5, "tabs expand to the tab stop");
  assert.match(pandaCss("data:x", 7), /margin-left: 7ch/);
  assert.match(bubbleCss(p), new RegExp(`-${p.lineCh}ch`), "bubble never starts left of column 0");
});

test("sorting scenes end sorted, and swapped values keep their ids so they slide", () => {
  for (const name of ["bubble", "selection", "insertion", "merge", "quick"]) {
    const scene: Scene = player.algoScene(name, [5, 2, 9, 1, 7, 3]);
    assert.ok(SceneSchema.safeParse(JSON.parse(JSON.stringify(scene))).success, `${name} matches the schema`);
    const last = scene.steps[scene.steps.length - 1].states[0];
    assert.deepEqual(last.nodes.map((n) => Number(n.value)), [1, 2, 3, 5, 7, 9], `${name} ends sorted`);
    if (name !== "merge") {
      // Ids travel with values: the box labelled 9 is the same element from start to end.
      const first = scene.steps[0].states[0].nodes.find((n) => n.value === "9")!;
      assert.equal(last.nodes.find((n) => n.value === "9")!.id, first.id, `${name} keeps ids`);
    }
    for (const s of scene.steps) if (s.question) assert.ok(s.question.answer < s.question.options.length);
  }
  const bs: Scene = player.algoScene("binary");
  assert.ok(bs.steps.some((s) => /Found/.test(s.caption)));
  const tree: Scene = player.algoScene("bst");
  assert.equal(tree.structures[0].kind, "tree");
  assert.ok(normalizeScene(JSON.parse(JSON.stringify({ ...tree, steps: tree.steps.slice(0, 20) }))).steps.length >= 2);
});

test("the wrap-up is validated, guarded and exported as notes", () => {
  const raw = {
    headline: "You got your ring counting working by tracing it on paper.",
    workedOn: ["Counting nodes in a circular linked list", "", "Building a ring"],
    figuredOut: ["Why `node is not head` stops the loop"],
    stillFuzzy: ["Here's how:\n```python\ndef count(h):\n    n = 1\n    x = h.next\n    while x is not h:\n        n += 1\n```"],
    planCheck: "You finished steps 1 and 2 of your plan; step 3 (deleting) is next.",
    nextTime: ["Write insert for the ring", "Try a one-node ring", "Draw the pointers before coding", "extra item dropped"],
  };
  const s = normalizeSummary(raw);
  assert.deepEqual(s.workedOn, ["Counting nodes in a circular linked list", "Building a ring"], "empty items dropped");
  assert.equal(s.nextTime.length, 3, "capped");
  assert.doesNotMatch(s.stillFuzzy.join(" "), /n \+= 1/, "code in a summary is hidden");
  assert.throws(() => normalizeSummary({ headline: "x" }));

  const log = newSessionLog(Date.now() - 25 * 60000);
  assert.equal(isEmptySession(log), true);
  log.events.push({ at: Date.now(), kind: "checkPlan", detail: "1. make Node 2. link ring 3. count" });
  log.plans.push("1. make Node 2. link ring 3. count");
  log.reviews = 2;
  log.hints = [1, 1, 0];
  log.concepts = { "linked lists": 3, loops: 1 };
  const stats = sessionStats(log, Date.now(), 4);
  assert.equal(stats.minutes, 25);
  assert.equal(stats.hints, 2);
  assert.deepEqual(stats.topConcepts, ["linked lists", "loops"]);
  const md = summaryMarkdown(s, stats, new Date("2026-10-21T12:00:00Z"));
  assert.match(md, /^# Mentor notes, 2026-10-21/);
  assert.match(md, /## Your plan/);
  assert.match(md, /25 min · 2 reviews · 1 plan checked · 2 hints/);
  assert.match(summaryInput(log, [{ role: "user", content: "see:\n```py\nx = 1\n```" }]), /\[code\]/, "code is left out of what the model sees");
});
