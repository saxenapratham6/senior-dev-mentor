import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

// The webview loads Codicons from media/, since it cannot reach node_modules.
mkdirSync("media/codicons", { recursive: true });
for (const f of ["codicon.css", "codicon.ttf"]) cpSync(`node_modules/@vscode/codicons/dist/${f}`, `media/codicons/${f}`);

const watch = process.argv.includes("--watch");
const ctx = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
});
if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
