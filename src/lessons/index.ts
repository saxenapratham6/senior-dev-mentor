import * as fs from "fs";
import * as path from "path";
import { parseLesson } from "./parse";
import type { Lesson } from "./types";

/** Every lesson in a folder, in file-name order (files are numbered). */
export function loadLessons(dir: string): Lesson[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseLesson(fs.readFileSync(path.join(dir, f), "utf8"), f));
}

export type LessonOutputs = Record<string, { stdout: string; error?: string }>;
