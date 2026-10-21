// Visual check, not a test: puts the real panda, sidebar and board in a few
// states and holds each so they can be looked at. MENTOR_IT_SUITE=look.cjs.
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hold = () => sleep(Number(process.env.LOOK_HOLD || 12000));
exports.run = async function () {
  const { panda, board } = await vscode.extensions.getExtension("senior-dev-mentor.senior-dev-mentor").activate();
  const file = path.join(process.env.MENTOR_IT_DIR, "ring.py");
  fs.writeFileSync(file, [
    "class Node:", "    def __init__(self, value):", "        self.value = value", "        self.next = None", "",
    "def count_nodes(head):", "    if head is None:", "        return 0", "    count = 1", "    node = head.next",
    "    while node is not head:", "        count += 1", "        node = node.next", "    return count", "",
    "def build_ring(values):", "    nodes = [Node(v) for v in values]", "    for a, b in zip(nodes, nodes[1:]):", "        a.next = b",
    "    return nodes[0]", "",
  ].join("\n"));
  const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
  await vscode.commands.executeCommand("seniorDevMentor.view.focus");
  await vscode.window.showTextDocument(editor.document, { preserveFocus: false });
  editor.selection = new vscode.Selection(2, 0, 2, 0);
  await sleep(2500);
  console.log("LOOK idle");
  await hold();
  await panda.tour(editor.document.uri, [{ line: 10, note: "On line 11, what does `node is not head` compare: values or the objects themselves?" }], { reveal: true });
  console.log("LOOK stop");
  await hold();
  panda.dismiss();
  board.show({ type: "examples" });
  console.log("LOOK board");
  await sleep(Number(process.env.LOOK_BOARD_HOLD || 40000));
  board.show({
    type: "summary",
    summary: {
      headline: "You got count_nodes working on a ring by tracing pointers instead of guessing.",
      workedOn: ["Counting nodes in a circular linked list", "Building a ring from a list of values"],
      figuredOut: ["Why the loop stops at `node is not head`", "That an empty ring needs its own check"],
      stillFuzzy: ["What happens to a one-node ring?", "Where should insert put a new node?"],
      planCheck: "You finished steps 1 and 2 of your plan (Node class, counting). Step 3, insert, is next.",
      nextTime: ["Write insert_after for the ring", "Draw the pointers before you code"],
    },
    stats: { minutes: 42, streakDays: 3, questions: 4, reviews: 2, plans: 1, hints: 2, hintsByLevel: [1, 1, 0], quizzes: 1, predictions: "5/6", visualized: 2, redirected: 1, topConcepts: ["linked lists", "loops", "pointers"] },
  });
  console.log("LOOK summary");
  await hold();
};
