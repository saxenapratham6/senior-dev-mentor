// Prints the no-AI tour of a folder: npx tsx dev/tour-repo.ts [folder] [new|experienced]
import path from "node:path";
import { walkRepo, recentChanges } from "../src/repo/walk";
import { buildIndex } from "../src/repo/index";
import { buildRepoTour } from "../src/tour/tour";

(async () => {
  const root = path.resolve(process.argv[2] ?? ".");
  const w = await walkRepo(root);
  const idx = buildIndex(w.files, { rootName: path.basename(root), changes: await recentChanges(root) });
  const tour = buildRepoTour(idx, (process.argv[3] as "new" | "experienced") ?? "new");
  for (const c of tour.chapters) {
    console.log(`\n## ${c.title}`);
    for (const s of c.stops) console.log(`\n### ${s.path}:${s.line + 1}  «${s.bubble}»\n${s.note}`);
  }
  console.log("\n## Quiz");
  for (const q of tour.quiz) console.log(`- ${q.q}  →  ${q.a}`);
})();
