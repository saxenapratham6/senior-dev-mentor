// Visual check, not a test: opens the roadmap, holds, reopens it so saved
// progress can be checked by eye. MENTOR_IT_SUITE=look-roadmap.cjs.
const vscode = require("vscode");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
exports.run = async function () {
  const { board } = await vscode.extensions.getExtension("senior-dev-mentor.senior-dev-mentor").activate();
  await vscode.commands.executeCommand("seniorDevMentor.roadmap");
  console.log("LOOK roadmap");
  await sleep(45000);
  board.dispose();
  await sleep(1000);
  await vscode.commands.executeCommand("seniorDevMentor.roadmap");
  console.log("LOOK reopened");
  await sleep(25000);
};
