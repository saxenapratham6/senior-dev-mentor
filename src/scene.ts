// "Visualize anything": the model describes a visualization as a scene, a
// list of snapshots of data structures. A scene is plain data. It is checked
// and trimmed here by deterministic code before the webview animates it, and
// every caption goes through the same guardrail as chat replies.
import { z } from "zod";
import { guardText, GuardOptions, DEFAULT_GUARD } from "./guardrails";

export const STRUCTURE_KINDS = ["array", "linkedList", "stack", "queue", "tree", "graph", "hashTable", "variables"] as const;

const NodeSchema = z.object({
  id: z.string().describe("Stable id. Keep the same id for the same element in every step so it animates."),
  value: z.string().describe("Short text shown in the node, at most a few characters."),
  group: z.string().describe("hashTable: the bucket this entry is in. Empty string for other kinds."),
});
const LinkSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().describe('tree: "L" or "R" for binary children. graph: an edge weight, or empty. Otherwise empty.'),
});
const PointerSchema = z.object({
  name: z.string().describe("Variable name such as head, curr, prev, i, top, front."),
  target: z.string().describe("Node id it points at, or empty string for null/None."),
});
const StateSchema = z.object({
  structure: z.string().describe("Id of the structure this snapshot is for."),
  nodes: z.array(NodeSchema).describe("All elements, in order (array/queue left to right, stack bottom to top, linkedList in memory order)."),
  links: z.array(LinkSchema).describe("linkedList next pointers, tree edges (parent to child), graph edges."),
  pointers: z.array(PointerSchema),
  highlight: z.array(z.string()).describe("Ids of nodes the caption is talking about."),
});
const QuestionSchema = z.object({
  text: z.string(),
  options: z.array(z.string()).describe("2 to 4 short options."),
  answer: z.number().int().describe("Index of the correct option."),
});
const StepSchema = z.object({
  caption: z.string().describe("One or two sentences: what changed and why."),
  states: z.array(StateSchema).describe("Full snapshot of every structure at this step."),
  question: QuestionSchema.nullable().describe("A predict-the-next-step question shown before this step, or null."),
});
export const SceneSchema = z.object({
  title: z.string(),
  structures: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(STRUCTURE_KINDS),
      label: z.string(),
    }),
  ),
  steps: z.array(StepSchema),
});

export type Scene = z.infer<typeof SceneSchema>;

export const LIMITS = { structures: 4, steps: 24, nodes: 30, value: 24, caption: 320, options: 4 };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/**
 * Check and trim a scene from the model. Unknown references are dropped,
 * sizes are capped, missing snapshots carry over from the previous step, and
 * captions are guarded. Throws if nothing usable is left.
 */
export function normalizeScene(raw: unknown, guard: GuardOptions = DEFAULT_GUARD): Scene {
  const parsed = SceneSchema.safeParse(raw);
  if (!parsed.success) throw new Error("The visualization came back in the wrong shape.");
  const scene = parsed.data;

  const seen = new Set<string>();
  const structures = scene.structures
    .filter((s) => s.id && !seen.has(s.id) && seen.add(s.id))
    .slice(0, LIMITS.structures)
    .map((s) => ({ ...s, label: clip(s.label, 40) }));
  if (!structures.length) throw new Error("The visualization had no data structures to show.");
  const ids = new Set(structures.map((s) => s.id));

  const last = new Map<string, Scene["steps"][number]["states"][number]>();
  const steps: Scene["steps"] = [];
  for (const step of scene.steps.slice(0, LIMITS.steps)) {
    const states = [];
    for (const s of structures) {
      const st = step.states.find((x) => x.structure === s.id);
      if (!st) {
        const prev = last.get(s.id);
        if (prev) states.push(prev);
        continue;
      }
      const nodeIds = new Set<string>();
      const nodes = st.nodes
        .filter((n) => n.id && !nodeIds.has(n.id) && nodeIds.add(n.id))
        .slice(0, LIMITS.nodes)
        .map((n) => ({ id: clip(n.id, 40), value: clip(n.value, LIMITS.value), group: clip(n.group, 12) }));
      const kept = new Set(nodes.map((n) => n.id));
      const clean = {
        structure: s.id,
        nodes,
        links: st.links.filter((l) => kept.has(l.from) && kept.has(l.to)).slice(0, 60).map((l) => ({ ...l, label: clip(l.label, 8) })),
        pointers: st.pointers
          .filter((p) => p.name && (p.target === "" || kept.has(p.target)))
          .slice(0, 8)
          .map((p) => ({ name: clip(p.name, 12), target: p.target })),
        highlight: st.highlight.filter((h) => kept.has(h)),
      };
      last.set(s.id, clean);
      states.push(clean);
    }
    if (!states.length) continue;

    const caption = guardText(clip(step.caption, LIMITS.caption), guard).text.trim();
    let question = step.question;
    if (question) {
      const options = question.options.map((o) => clip(o, 40)).filter(Boolean).slice(0, LIMITS.options);
      question =
        options.length >= 2 && question.answer >= 0 && question.answer < options.length && question.text.trim()
          ? { text: guardText(clip(question.text, 200), guard).text.trim(), options, answer: question.answer }
          : null;
    }
    steps.push({ caption, states, question });
  }
  if (steps.length < 2) throw new Error("That visualization was too short to animate. Try again, or describe it differently. Small local models often struggle here; a bigger model helps.");
  for (const s of structures) if (!steps.some((st) => st.states.some((x) => x.structure === s.id))) ids.delete(s.id);

  return { title: clip(scene.title, 80), structures: structures.filter((s) => ids.has(s.id)), steps };
}

export function scenePrompt(): string {
  return `You turn a computer-science idea into a step-by-step animation for a student. You don't write code; you describe pictures of data structures.

Output a scene:
- "structures": up to 3 data structures to draw. Kinds: array, linkedList, stack, queue, tree, graph, hashTable, variables (a table of variable name -> value).
- "steps": 6 to 16 snapshots. Every step gives the FULL state of every structure, like frames of a movie. Give each element a stable "id" and keep it the same across steps, so the animation can move it. When a linked list is reversed, keep the node ids and change the links; don't rename the nodes.
- Use pointers for named references (head, curr, prev, next, i, j, top, front, rear, root). A pointer target of "" means null.
- Highlight the nodes the caption talks about.
- Captions: one or two plain-English sentences on what changed and WHY. No code.
- On about a third of the steps, add a predict question the student answers before seeing that step (for example "Where does curr point next?"). Otherwise use null.
- Keep it small: at most 10 nodes per structure, values of at most 4 characters.
- If you are tracing the student's code, choose a small input, say it in the first caption, and follow what THEIR code actually does, including its bugs. Don't fix it.
- If the request isn't something you can draw, draw the closest data structure idea and say so in the first caption.`;
}

// ---------------------------------------------------------------------------
// Line references in mentor replies: the model writes [[L12]]; we turn those
// into places the panda can walk to.

export interface LineRef {
  line: number; // 1-based, as the student sees it
  note: string; // the sentence or bullet the reference sits in
}

export function extractLineRefs(text: string, lineCount: number): LineRef[] {
  const refs: LineRef[] = [];
  const seen = new Set<number>();
  for (const chunk of text.split(/\n+/)) {
    for (const m of chunk.matchAll(/\[\[L(\d{1,6})\]\]/g)) {
      const line = Number(m[1]);
      if (line < 1 || line > lineCount || seen.has(line)) continue;
      seen.add(line);
      const note = chunk
        .replace(/^\s*([-*+]|\d+[.)])\s+/, "")
        .replace(/\[\[L(\d+)\]\]/g, "line $1")
        .trim();
      refs.push({ line, note: clip(note, 400) });
    }
  }
  return refs.slice(0, 8);
}
