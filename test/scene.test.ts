import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { normalizeScene, extractLineRefs, Scene } from "../src/scene";

// Load the webview's scene player with a stub window to reach the built-in scenes.
const win: Record<string, any> = {};
vm.runInNewContext(readFileSync(path.join(__dirname, "../media/scene.js"), "utf8"), { window: win });
const EXAMPLES: Record<string, () => Scene> = win.ScenePlayer.EXAMPLES;

test("every built-in scene passes the same checks as AI scenes, unchanged", () => {
  for (const [name, make] of Object.entries(EXAMPLES)) {
    const raw = JSON.parse(JSON.stringify(make()));
    const clean = normalizeScene(raw);
    assert.equal(clean.steps.length, raw.steps.length, `${name}: steps dropped`);
    assert.equal(clean.structures.length, raw.structures.length, `${name}: structures dropped`);
    raw.steps.forEach((s: Scene["steps"][number], i: number) => {
      for (const st of s.states) {
        const c = clean.steps[i].states.find((x) => x.structure === st.structure)!;
        assert.equal(c.links.length, st.links.length, `${name} step ${i}: links dropped`);
        assert.equal(c.pointers.length, st.pointers.length, `${name} step ${i}: pointers dropped`);
      }
      assert.equal(!!clean.steps[i].question, !!s.question, `${name} step ${i}: question dropped`);
    });
  }
});

test("linked list reversal really ends reversed", () => {
  const scene = EXAMPLES.linkedListReverse();
  const last = scene.steps[scene.steps.length - 1].states[0];
  const next = Object.fromEntries(last.links.map((l) => [l.from, l.to]));
  const head = last.pointers.find((p) => p.name === "prev")!.target;
  const order: string[] = [];
  for (let id: string | undefined = head; id; id = next[id]) order.push(last.nodes.find((n) => n.id === id)!.value);
  assert.deepEqual(order, ["9", "1", "7", "3"]);
});

test("bad references are dropped and missing snapshots carry over", () => {
  const raw = {
    title: "t",
    structures: [
      { id: "a", kind: "array", label: "A" },
      { id: "a", kind: "stack", label: "dup" },
    ],
    steps: [
      {
        caption: "one",
        states: [{ structure: "a", nodes: [{ id: "x", value: "1", group: "" }, { id: "x", value: "dup", group: "" }], links: [{ from: "x", to: "ghost", label: "" }], pointers: [{ name: "i", target: "ghost" }, { name: "j", target: "x" }], highlight: ["ghost", "x"] }],
        question: { text: "q", options: ["only one"], answer: 0 },
      },
      { caption: "two", states: [{ structure: "nope", nodes: [], links: [], pointers: [], highlight: [] }], question: { text: "q", options: ["a", "b"], answer: 5 } },
    ],
  };
  const s = normalizeScene(raw);
  assert.equal(s.structures.length, 1);
  const st = s.steps[0].states[0];
  assert.equal(st.nodes.length, 1);
  assert.equal(st.links.length, 0);
  assert.deepEqual(st.pointers.map((p) => p.name), ["j"]);
  assert.deepEqual(st.highlight, ["x"]);
  assert.equal(s.steps[0].question, null, "a one-option question is dropped");
  assert.equal(s.steps[1].states[0].nodes[0].value, "1", "the array carries over into step two");
  assert.equal(s.steps[1].question, null, "an out-of-range answer is dropped");
});

test("code in captions is hidden by the guardrail", () => {
  const raw = EXAMPLES.stackOps();
  raw.steps[1].caption = "Here's the code:\n```python\ndef push(s, x):\n    s.append(x)\n    print(s)\n    return s\n```";
  assert.doesNotMatch(normalizeScene(raw).steps[1].caption, /append/);
});

test("the wrong shape, and scenes too short to animate, are rejected", () => {
  assert.throws(() => normalizeScene({ title: "x" }));
  assert.throws(() => normalizeScene({ title: "x", structures: [], steps: [] }));
  const one = EXAMPLES.stackOps();
  one.steps = one.steps.slice(0, 1);
  assert.throws(() => normalizeScene(one), /too short/);
});

test("line references become stops for the panda", () => {
  const text = "Nice loop!\n\n- On [[L4]], what happens when `nums` is empty?\n- Compare [[L7]] with [[L4]]: are both needed?\n- And [[L99]] is out of range.";
  const refs = extractLineRefs(text, 20);
  assert.deepEqual(refs.map((r) => r.line), [4, 7]);
  assert.equal(refs[0].note, "On line 4, what happens when `nums` is empty?");
  assert.match(refs[1].note, /^Compare line 7 with line 4/);
});
