// Runs test/integration/suite.cjs inside a real VS Code: the copy installed in
// /Applications, or the one VSCODE_PATH points to. It never downloads VS Code.
// Usage: npm run test:vscode
import { runTests } from "@vscode/test-electron";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const vscodePath = process.env.VSCODE_PATH || "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
if (!existsSync(vscodePath)) {
  console.error(`VS Code not found at ${vscodePath}. Set VSCODE_PATH to your VS Code executable.`);
  process.exit(1);
}
const scratch = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), "mentor-it-"));

await runTests({
  vscodeExecutablePath: vscodePath,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test/integration/suite.cjs"),
  launchArgs: ["--disable-extensions", "--user-data-dir", path.join(scratch, "user"), scratch],
  extensionTestsEnv: { MENTOR_IT_DIR: scratch, MENTOR_IT_SHOT: process.env.MENTOR_IT_SHOT ?? "" },
});
