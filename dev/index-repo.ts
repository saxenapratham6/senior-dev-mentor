// Prints what the mentor's repo index sees in a folder: npx tsx dev/index-repo.ts [folder]
import path from "node:path";
import { walkRepo, recentChanges } from "../src/repo/walk";
import { buildIndex } from "../src/repo/index";

(async () => {
  const root = path.resolve(process.argv[2] ?? ".");
  const t0 = Date.now();
  const w = await walkRepo(root);
  const idx = buildIndex(w.files, { rootName: path.basename(root), changes: await recentChanges(root), totalFiles: w.totalFiles, truncated: w.truncated });
  console.log(`${idx.name}: ${idx.description ?? ""}  (${w.files.length} files, ${Date.now() - t0} ms)`);
  console.log("languages:", idx.languages.map((l) => `${l.name} ${l.files}/${l.lines}`).join(", "));
  console.log("frameworks:", idx.frameworks.map((f) => f.name).join(", "));
  for (const b of ["start", "core", "supporting"] as const) {
    console.log(`\n${b}:`);
    for (const f of idx.files.filter((f) => f.bucket === b).sort((a, b) => b.score - a.score).slice(0, 15))
      console.log(`  ${String(f.score).padStart(3)} ${f.path}  [${f.reasons.join("; ")}]${f.role ? `  — ${f.role}` : ""}${f.routes.length ? `  routes: ${f.routes.map((r) => r.method + " " + r.path).join(", ")}` : ""}`);
  }
  const skip = idx.files.filter((f) => f.bucket === "skip");
  const why = new Map<string, number>();
  for (const f of skip) why.set(f.skipWhy!, (why.get(f.skipWhy!) ?? 0) + 1);
  console.log("\nskip:", [...why.entries()].map(([w, n]) => `${n} × ${w}`).join("\n      "));
  console.log("\nfolders:", idx.folders.map((f) => `${f.path} (${f.files}): ${f.role}`).join("\n         "));
})();
