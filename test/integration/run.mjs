// Runs test/integration/suite.cjs inside a real VS Code. Uses the copy installed
// in /Applications when there is one, so nothing is downloaded.
// Usage: npm run build && npm run test:vscode
import { runTests } from "@vscode/test-electron";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const local = "/Applications/Visual Studio Code.app/Contents/MacOS/Electron";
const scratch = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), "mentor-it-"));

await runTests({
  vscodeExecutablePath: existsSync(local) ? local : undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test/integration/suite.cjs"),
  launchArgs: ["--disable-extensions", "--user-data-dir", path.join(scratch, "user"), scratch],
  extensionTestsEnv: { MENTOR_IT_DIR: scratch, MENTOR_IT_SHOT: process.env.MENTOR_IT_SHOT ?? "" },
});
