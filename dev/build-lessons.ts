// Runs every lesson example with Python and saves what it prints to
// media/lesson-outputs.json, so the board can reveal outputs even without
// Python installed. Usage: npm run lessons (uses $PYTHON, default python3).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadLessons, LessonOutputs } from "../src/lessons/index";
import { examplesOf } from "../src/lessons/types";
import { runPython } from "../src/lessons/run";

const root = path.join(__dirname, "..");
const python = process.env.PYTHON || "python3";

(async () => {
  const lessons = loadLessons(path.join(root, "lessons"));
  const outputs: LessonOutputs = {};
  for (const lesson of lessons) {
    for (const ex of examplesOf(lesson)) {
      const r = await runPython(python, ["-c", ex.code]);
      if (r.missing) throw new Error(`Can't run ${python}`);
      outputs[ex.id] = r.error ? { stdout: r.stdout, error: r.error } : { stdout: r.stdout };
    }
  }
  writeFileSync(path.join(root, "media", "lesson-outputs.json"), JSON.stringify(outputs, null, 1) + "\n");
  console.log(`Wrote outputs for ${Object.keys(outputs).length} examples from ${lessons.length} lessons.`);
})();
