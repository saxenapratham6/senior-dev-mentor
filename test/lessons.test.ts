import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadLessons, LessonOutputs } from "../src/lessons/index";
import { examplesOf, practiceFile, parseCheckOutput, CHECK_HELPER } from "../src/lessons/types";
import { runPython } from "../src/lessons/run";
import { classifyRequest } from "../src/guardrails";

const root = path.join(__dirname, "..");
const lessons = loadLessons(path.join(root, "lessons"));
const outputs: LessonOutputs = JSON.parse(readFileSync(path.join(root, "media", "lesson-outputs.json"), "utf8"));
const python = process.env.PYTHON || "python3";
const tmp = mkdtempSync(path.join(tmpdir(), "lessons-"));

test("every lesson is complete and ids are unique", () => {
  const ids = new Set<string>();
  const exerciseIds = new Set<string>();
  for (const l of lessons) {
    assert.ok(!ids.has(l.id), `duplicate lesson id ${l.id}`);
    ids.add(l.id);
    assert.ok(l.quiz.length >= 2, `${l.id} has at least 2 quiz questions`);
    assert.ok(l.exercises.length >= 1, `${l.id} has an exercise`);
    for (const e of l.exercises) {
      assert.ok(!exerciseIds.has(e.id), `duplicate exercise id ${e.id}`);
      exerciseIds.add(e.id);
      assert.ok(existsSync(path.join(root, "test", "solutions", `${e.id}.py`)), `${e.id} has a reference solution`);
    }
    if (l.unit === 3) {
      assert.ok(l.signals && l.signals.length >= 2, `${l.id} lists signals`);
      assert.ok(l.ladder && l.ladder.some((p) => p.difficulty === "hard"), `${l.id}'s ladder reaches hard`);
    }
    assert.equal(classifyRequest(l.title).kind, "allowed");
  }
});

test("every example prints exactly what the board shows", async () => {
  for (const l of lessons) {
    for (const ex of examplesOf(l)) {
      const saved = outputs[ex.id];
      assert.ok(saved, `${ex.id} has a saved output; run npm run lessons`);
      const r = await runPython(python, ["-c", ex.code]);
      assert.equal(r.stdout, saved.stdout, `${ex.id} output changed; run npm run lessons`);
      assert.equal(r.error, saved.error, `${ex.id} error changed`);
      if (!l.pitfalls?.some((p) => p.code === ex.code)) assert.equal(r.error, undefined, `${ex.id} should not raise (only pitfalls may)`);
    }
  }
});

test("every exercise starts failing and its reference solution passes", async () => {
  for (const l of lessons) {
    for (const e of l.exercises) {
      const starterFile = path.join(tmp, `${e.id}.py`);
      writeFileSync(starterFile, practiceFile(l, e));
      const before = parseCheckOutput((await runPython(python, [starterFile])).stdout);
      assert.ok(before.failed > 0 && before.passed + before.failed >= 3, `${e.id}: the starter runs its checks and fails some (${before.passed} passed)`);

      const solution = readFileSync(path.join(root, "test", "solutions", `${e.id}.py`), "utf8");
      const solved = practiceFile(l, { ...e, starter: solution });
      const solvedFile = path.join(tmp, `${e.id}.solved.py`);
      writeFileSync(solvedFile, solved);
      const r = await runPython(python, [solvedFile]);
      const after = parseCheckOutput(r.stdout);
      assert.equal(after.failed, 0, `${e.id}: reference solution fails:\n${after.lines.join("\n")}${r.error ? "\n" + r.error : ""}`);
      assert.equal(after.passed, before.passed + before.failed, `${e.id}: same number of checks`);
    }
  }
});

test("the check helper reports pass, fail and errors", () => {
  assert.match(CHECK_HELPER, /def check/);
  assert.deepEqual(parseCheckOutput("PASS a\nFAIL b: got 1, want 2\nnoise\nFAIL c: raised ValueError: x\n"), {
    passed: 1,
    failed: 2,
    lines: ["PASS a", "FAIL b: got 1, want 2", "FAIL c: raised ValueError: x"],
  });
});
