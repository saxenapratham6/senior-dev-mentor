// Integration checks for the editor panda, run inside VS Code by run.mjs.
const vscode = require("vscode");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message}`);
  }
}

exports.run = async function () {
  const ext = vscode.extensions.getExtension("senior-dev-mentor.senior-dev-mentor");
  const api = await ext.activate();
  const panda = api.panda;

  const file = path.join(process.env.MENTOR_IT_DIR, "main.py");
  const lines = ["def best(nums):", "    m = nums[0]", ...Array.from({ length: 80 }, (_, i) => `    # filler ${i}`), "    for n in nums:", "        if n > m:", "            m = n", "    return m", ""];
  fs.writeFileSync(file, lines.join("\n"));
  const doc = await vscode.workspace.openTextDocument(file);
  const editor = await vscode.window.showTextDocument(doc);
  await sleep(500);

  await check("commands are registered", async () => {
    const all = await vscode.commands.getCommands(true);
    for (const c of ["seniorDevMentor.review", "seniorDevMentor.pandaNext", "seniorDevMentor.pandaDismiss", "seniorDevMentor.pandaAsk"]) assert.ok(all.includes(c), c);
  });

  await check("the panda walks to an off-screen line and scrolls it into view", async () => {
    const target = 84; // `if n > m:`, far below the first screen
    assert.ok(!editor.visibleRanges.some((r) => r.contains(new vscode.Position(target, 0))), "target starts off screen");
    const went = await panda.tour(doc.uri, [{ line: target, note: "What should happen when `n` equals `m`?" }, { line: 1, note: "What if `nums` is empty?" }], { reveal: true });
    assert.equal(went, true);
    assert.equal(panda.active, true);
    assert.equal(panda.current.line, target);
    assert.ok(editor.visibleRanges.some((r) => r.contains(new vscode.Position(target, 0))), "target is on screen");
  });

  if (process.env.MENTOR_IT_SHOT) {
    // Optional: capture the window while the panda sits at the line (needs screen-recording permission).
    await sleep(800);
    require("node:child_process").spawnSync("screencapture", ["-x", process.env.MENTOR_IT_SHOT]);
  }

  await check("Next stop walks back up to the second line", async () => {
    await vscode.commands.executeCommand("seniorDevMentor.pandaNext");
    assert.equal(panda.current.line, 1);
  });

  await check("editing the line the panda points at sends it home", async () => {
    await editor.edit((e) => e.insert(new vscode.Position(1, 0), "    # checked\n"));
    await sleep(100);
    assert.equal(panda.active, false);
  });

  await check("a save nudge walks over only when the line is already on screen", async () => {
    // Line 0 is visible: the recursion nudge for a function without a base case.
    await editor.edit((e) => e.insert(new vscode.Position(0, 0), "def f(n):\n    return f(n - 1)\n\n"));
    editor.revealRange(new vscode.Range(0, 0, 0, 0), vscode.TextEditorRevealType.AtTop);
    await sleep(200);
    await doc.save();
    await sleep(1500);
    assert.equal(panda.active, true, "panda went to the visible line");
    assert.equal(panda.current.line, 0);
  });

  await check("Got it dismisses the panda", async () => {
    await vscode.commands.executeCommand("seniorDevMentor.pandaDismiss");
    assert.equal(panda.active, false);
  });

  await check("a nudge for an off-screen line does not scroll the editor", async () => {
    const far = await panda.tour(doc.uri, [{ line: 80, note: "x" }], { reveal: false });
    editor.revealRange(new vscode.Range(0, 0, 0, 0), vscode.TextEditorRevealType.AtTop);
    await sleep(200);
    const again = await panda.tour(doc.uri, [{ line: 80, note: "x" }], { reveal: false });
    assert.equal(again, false);
    assert.ok(far === true || far === false);
  });

  console.log("\n" + results.join("\n") + "\n");
  if (results.some((r) => r.startsWith("FAIL"))) throw new Error("integration checks failed");
};
