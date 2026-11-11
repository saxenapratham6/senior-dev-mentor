// What the AI model must send back when it writes a repo tour. Every field is
// required (empty strings and lists are fine), so the shapes work as strict
// structured output for Claude and as a JSON schema for Ollama. Lengths and
// counts are enforced afterwards by normalize.ts, not trusted.
import { z } from "zod";

export const FileSummariesSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      purpose: z.string(), // one or two sentences
      parts: z.array(z.object({ name: z.string(), line: z.number().int(), what: z.string() })),
      notable: z.array(z.object({ line: z.number().int(), anchor: z.string(), why: z.string() })),
    }),
  ),
});
export type FileSummaries = z.infer<typeof FileSummariesSchema>;
export type FileSummary = FileSummaries["files"][number];

export const OverviewSchema = z.object({
  purpose: z.string(), // what the project is for, in plain words
  users: z.string(), // who uses it and how
  howItWorks: z.string(), // the path a request or command takes, in a few sentences
  architecture: z.object({
    boxes: z.array(z.object({ id: z.string(), label: z.string(), what: z.string(), files: z.array(z.string()) })),
    arrows: z.array(z.object({ from: z.string(), to: z.string(), label: z.string() })),
  }),
  glossary: z.array(z.object({ term: z.string(), meaning: z.string() })),
});
export type Overview = z.infer<typeof OverviewSchema>;

export const AiTourSchema = z.object({
  chapters: z.array(
    z.object({
      title: z.string(),
      why: z.string(),
      stops: z.array(
        z.object({
          path: z.string(),
          line: z.number().int(), // 1-based, as numbered in the excerpts
          anchor: z.string(), // a short piece of that line, copied exactly
          bubble: z.string(),
          explain: z.string(),
          simpler: z.string(),
          deeper: z.string(),
          checkQuestion: z.string(), // may be empty
          checkAnswer: z.string(),
        }),
      ),
    }),
  ),
});
export type AiTour = z.infer<typeof AiTourSchema>;
