// Scene player for "Visualize anything". A scene is a list of snapshots of
// data structures (see src/scene.ts). Elements keep their ids across steps,
// so the player tweens every node, pointer and arrow from where it was to
// where it is now: a reversed list visibly re-links, a pointer walks along.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const TWEEN_MS = 520;
  const NODE_W = 42;
  const NODE_H = 30;
  const PTR_ROW = 18;
  const LABEL_H = 18;

  // ------------------------------------------------------------ built-in scenes
  // Each returns a scene in the same shape the model produces. They work
  // offline and double as examples of the format.

  function st(structure, nodes, links = [], pointers = [], highlight = []) {
    return { structure, nodes, links, pointers, highlight };
  }
  const n = (id, value, group = "") => ({ id, value: String(value), group });
  const yn = (text, yes) => ({ text, options: ["Yes", "No"], answer: yes ? 0 : 1 });

  function linkedListReverse() {
    const vals = [3, 7, 1, 9];
    const nodes = vals.map((v, i) => n(`n${i}`, v));
    let next = { n0: "n1", n1: "n2", n2: "n3", n3: "" };
    const links = () => Object.entries(next).filter(([, t]) => t).map(([f, t]) => ({ from: f, to: t, label: "" }));
    const ptrs = (prev, curr, nxt) => [
      { name: "prev", target: prev },
      { name: "curr", target: curr },
      ...(nxt !== undefined ? [{ name: "next", target: nxt }] : []),
    ];
    const steps = [
      { caption: "Start: prev is null and curr is the head. We'll flip one arrow per step.", states: [st("L", nodes, links(), ptrs("", "n0"), ["n0"])], question: null },
    ];
    let prev = "";
    for (let i = 0; i < vals.length; i++) {
      const curr = `n${i}`;
      const nx = next[curr];
      steps.push({
        caption: `Save next = ${nx ? vals[i + 1] : "null"} first, or we'd lose the rest of the list when we flip curr's arrow.`,
        states: [st("L", nodes, links(), ptrs(prev, curr, nx), [curr])],
        question: i === 0 ? { text: "Before flipping curr.next, what must we save?", options: ["curr.next", "prev", "head"], answer: 0 } : null,
      });
      next = { ...next, [curr]: prev };
      steps.push({
        caption: `Point ${vals[i]}'s arrow back at ${prev ? vals[i - 1] : "null"}.`,
        states: [st("L", nodes, links(), ptrs(prev, curr, nx), [curr])],
        question: i === 1 ? { text: `Which way does ${vals[i]}'s arrow point now?`, options: [`Back to ${vals[i - 1]}`, `Forward to ${vals[i + 1]}`], answer: 0 } : null,
      });
      prev = curr;
      steps.push({
        caption: nx ? "Move both pointers one step forward: prev = curr, curr = next." : "curr is null, so we're done. prev is the new head.",
        states: [st("L", nodes, links(), ptrs(prev, nx), nx ? [nx] : [prev])],
        question: i === 2 ? yn("Is curr null after this step?", false) : null,
      });
    }
    return { title: "Reversing a linked list", structures: [{ id: "L", kind: "linkedList", label: "list" }], steps };
  }

  function stackOps() {
    const ops = [["push", 4], ["push", 8], ["push", 2], ["pop"], ["push", 5], ["pop"], ["pop"]];
    const stack = [];
    let id = 0;
    const steps = [{ caption: "An empty stack. Last in, first out: you only ever touch the top.", states: [st("S", [], [], [{ name: "top", target: "" }]), st("out", [])], question: null }];
    const popped = [];
    for (const [op, v] of ops) {
      let question = null;
      if (op === "push") {
        stack.push(n(`s${id++}`, v));
      } else {
        const topV = stack[stack.length - 1].value;
        const bottomV = stack[0].value;
        question = { text: "Which value comes off?", options: topV !== bottomV ? [topV, bottomV] : [topV, "nothing"], answer: 0 };
        popped.push(stack.pop());
      }
      const top = stack.length ? stack[stack.length - 1].id : "";
      steps.push({
        caption: op === "push" ? `push(${v}) goes on top.` : `pop() removes the top, ${popped[popped.length - 1].value}, the most recent push.`,
        states: [st("S", stack.slice(), [], [{ name: "top", target: top }], top ? [top] : []), st("out", popped.slice())],
        question,
      });
    }
    return { title: "Stack: push and pop", structures: [{ id: "S", kind: "stack", label: "stack" }, { id: "out", kind: "array", label: "popped, in order" }], steps };
  }

  function queueOps() {
    const ops = [["enqueue", "A"], ["enqueue", "B"], ["enqueue", "C"], ["dequeue"], ["enqueue", "D"], ["dequeue"]];
    const q = [];
    let id = 0;
    const ptr = () => [{ name: "front", target: q[0] ? q[0].id : "" }, { name: "rear", target: q.length ? q[q.length - 1].id : "" }];
    const steps = [{ caption: "An empty queue. First in, first out, like a line at the dining hall.", states: [st("Q", [], [], ptr())], question: null }];
    for (const [op, v] of ops) {
      let question = null;
      let caption;
      if (op === "enqueue") {
        q.push(n(`q${id++}`, v));
        caption = `enqueue(${v}) joins at the rear.`;
      } else {
        question = { text: "Who leaves the queue?", options: [q[0].value, q[q.length - 1].value], answer: 0 };
        const out = q.shift();
        caption = `dequeue() removes ${out.value} from the front: it waited longest.`;
      }
      steps.push({ caption, states: [st("Q", q.slice(), [], ptr(), q.length ? [q[0].id] : [])], question });
    }
    return { title: "Queue: enqueue and dequeue", structures: [{ id: "Q", kind: "queue", label: "queue" }], steps };
  }

  function bfs() {
    const names = ["A", "B", "C", "D", "E", "F"];
    const edges = [["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"], ["C", "E"], ["D", "F"]];
    const adj = Object.fromEntries(names.map((x) => [x, []]));
    for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
    const G = (hl) => st("G", names.map((x) => n(x, x)), edges.map(([a, b]) => ({ from: a, to: b, label: "" })), [], hl);
    const visited = new Set(["A"]);
    const queue = ["A"];
    const order = [];
    const steps = [{ caption: "Start BFS at A: mark it visited and put it in the queue.", states: [G(["A"]), st("Q", queue.map((x) => n(`q${x}`, x))), st("V", [])], question: null }];
    let asked = 0;
    while (queue.length) {
      const cur = queue.shift();
      order.push(cur);
      const fresh = adj[cur].filter((x) => !visited.has(x));
      const q = asked++ < 3 && fresh.length ? { text: `Which unvisited neighbors of ${cur} join the queue?`, options: [fresh.join(", "), adj[cur].join(", ")].filter((v, i, a) => a.indexOf(v) === i).concat(fresh.length === adj[cur].length ? ["none"] : []), answer: 0 } : null;
      fresh.forEach((x) => { visited.add(x); queue.push(x); });
      steps.push({
        caption: fresh.length ? `Take ${cur} from the front. Its unvisited neighbors ${fresh.join(", ")} are marked and queued.` : `Take ${cur} from the front. All its neighbors are already visited.`,
        states: [G([cur, ...fresh]), st("Q", queue.map((x) => n(`q${x}`, x))), st("V", order.map((x) => n(`v${x}`, x)))],
        question: q,
      });
    }
    steps.push({ caption: "The queue is empty. BFS visited nodes in order of distance from A.", states: [G([]), st("Q", []), st("V", order.map((x) => n(`v${x}`, x)))], question: null });
    return {
      title: "Breadth-first search",
      structures: [{ id: "G", kind: "graph", label: "graph" }, { id: "Q", kind: "queue", label: "queue" }, { id: "V", kind: "array", label: "visit order" }],
      steps,
    };
  }

  function hashChaining() {
    const keys = ["cat", "dog", "emu", "ant", "owl", "bee"];
    const B = 4;
    const h = (k) => [...k].reduce((a, c) => a + c.charCodeAt(0), 0) % B;
    const entries = [];
    const buckets = Array.from({ length: B }, (_, i) => n(`b${i}`, `[${i}]`, String(i)));
    const state = (hl) => st("H", [...buckets, ...entries], [], [], hl);
    const steps = [{ caption: `${B} empty buckets. hash(key) = sum of the letter codes mod ${B} picks the bucket.`, states: [state([])], question: null }];
    keys.forEach((k, i) => {
      const b = h(k);
      const clash = entries.some((e) => e.group === String(b));
      entries.push(n(`k${k}`, k, String(b)));
      steps.push({
        caption: clash ? `hash("${k}") = ${b}, but bucket ${b} is taken. With chaining, "${k}" joins that bucket's list.` : `hash("${k}") = ${b}, so "${k}" goes in bucket ${b}.`,
        states: [state([`k${k}`, `b${b}`])],
        question: i >= 3 && i <= 4 ? { text: `hash("${k}") = ${b}. Is there already something in bucket ${b}?`, options: ["Yes, a collision", "No, it's empty"], answer: clash ? 0 : 1 } : null,
      });
    });
    steps.push({ caption: "To find a key, hash it to get the bucket, then walk only that bucket's short list.", states: [state([])], question: null });
    return { title: "Hash table with chaining", structures: [{ id: "H", kind: "hashTable", label: "table" }], steps };
  }

  function treeInorder() {
    const vals = [50, 30, 70, 20, 40, 60, 80];
    const nodes = vals.map((v) => n(`t${v}`, v));
    const links = [];
    const kids = {};
    const insert = (v) => {
      let cur = vals[0];
      for (;;) {
        const side = v < cur ? "L" : "R";
        kids[cur] = kids[cur] || {};
        if (kids[cur][side] === undefined) { kids[cur][side] = v; links.push({ from: `t${cur}`, to: `t${v}`, label: side }); return; }
        cur = kids[cur][side];
      }
    };
    vals.slice(1).forEach(insert);
    const order = [];
    const steps = [{ caption: "In-order traversal: left subtree, then the node, then the right subtree.", states: [st("T", nodes, links, [{ name: "root", target: "t50" }]), st("out", [])], question: null }];
    const walk = (v) => {
      if (v === undefined) return;
      walk(kids[v] && kids[v].L);
      order.push(v);
      steps.push({
        caption: `Visit ${v}: everything in its left subtree is already done.`,
        states: [st("T", nodes, links, [{ name: "visit", target: `t${v}` }], [`t${v}`]), st("out", order.map((x) => n(`o${x}`, x)))],
        question: order.length === 2 || order.length === 5 ? { text: "Which node is visited next?", options: [String(v), ...vals.filter((x) => !order.includes(x)).slice(0, 2).map(String)], answer: 0 } : null,
      });
      walk(kids[v] && kids[v].R);
    };
    walk(vals[0]);
    steps.push({ caption: "The output is sorted. In-order traversal of a BST always gives sorted order.", states: [st("T", nodes, links, [], []), st("out", order.map((x) => n(`o${x}`, x)))], question: null });
    return { title: "Binary search tree: in-order traversal", structures: [{ id: "T", kind: "tree", label: "BST" }, { id: "out", kind: "array", label: "output" }], steps };
  }

  const EXAMPLES = { linkedListReverse, stackOps, queueOps, bfs, hashChaining, treeInorder };

  // Sorting and searching come from the step generators in visualizer.js,
  // replayed into snapshots. Each value keeps its id, so swapped boxes slide.
  const ALGO_TITLES = { bubble: "Bubble sort", selection: "Selection sort", insertion: "Insertion sort", merge: "Merge sort", quick: "Quick sort", binary: "Binary search", bst: "Binary search tree: insert" };

  function algoScene(name, input) {
    const gen = window.Visualizer.ALGOS[name];
    if (name === "bst") {
      const values = input || [8, 3, 10, 1, 6, 14, 4, 7];
      const steps = [];
      for (const s of gen(values.slice())) {
        const nodes = s.nodes.map((x) => n(`t${x.v}`, x.v));
        const links = [];
        s.nodes.forEach((x) => {
          if (x.left !== -1) links.push({ from: `t${x.v}`, to: `t${s.nodes[x.left].v}`, label: "L" });
          if (x.right !== -1) links.push({ from: `t${x.v}`, to: `t${s.nodes[x.right].v}`, label: "R" });
        });
        const at = s.at >= 0 ? [`t${s.nodes[s.at].v}`] : [];
        steps.push({ caption: s.caption, states: [st("T", nodes, links, s.nodes.length ? [{ name: "root", target: `t${s.nodes[0].v}` }] : [], at)], question: s.q || null });
      }
      return { title: ALGO_TITLES[name], structures: [{ id: "T", kind: "tree", label: "tree" }], steps };
    }

    let values = input || [7, 3, 9, 1, 6, 2, 8];
    let target;
    if (name === "binary") {
      values = input || [2, 5, 8, 12, 16, 23, 38, 56, 72];
      target = values[6];
    }
    const ids = values.map((_, i) => `v${i}`);
    const vals = values.slice();
    let range = null;
    let compares = 0;
    const steps = [{ caption: name === "binary" ? `Looking for ${target} in a sorted array.` : "Here's the unsorted array.", states: [st("A", ids.map((id, k) => n(id, vals[k])))], question: null }];
    for (const s of gen(values.slice(), target)) {
      let hl = [];
      const ptrs = [];
      if (s.type === "compare") {
        hl = s.i === s.j ? [ids[s.i]] : [ids[s.i], ids[s.j]];
        if (name === "binary") ptrs.push({ name: "mid", target: ids[s.i] });
      } else if (s.type === "swap") {
        [ids[s.i], ids[s.j]] = [ids[s.j], ids[s.i]];
        [vals[s.i], vals[s.j]] = [vals[s.j], vals[s.i]];
        hl = [ids[s.i], ids[s.j]];
      } else if (s.type === "set") {
        vals[s.i] = s.value;
        hl = [ids[s.i]];
      } else if (s.type === "mark" || s.type === "pivot") {
        hl = [ids[s.i]];
        ptrs.push({ name: s.type === "pivot" ? "pivot" : "min", target: ids[s.i] });
      } else if (s.type === "sorted") {
        hl = s.idx.length < vals.length ? s.idx.map((k) => ids[k]) : [];
      } else if (s.type === "range") {
        range = s.lo <= s.hi ? [s.lo, s.hi] : null;
      }
      if (range && name === "binary") {
        ptrs.push({ name: "lo", target: ids[range[0]] }, { name: "hi", target: ids[range[1]] });
      }
      // Ask about every other comparison so predict mode stays a game, not a chore.
      const ask = s.q && (s.type !== "compare" || compares++ % 2 === 0);
      steps.push({ caption: s.caption, states: [st("A", ids.map((id, k) => n(id, vals[k])), [], ptrs, hl)], question: ask ? s.q : null });
    }
    return { title: ALGO_TITLES[name], structures: [{ id: "A", kind: "array", label: name === "binary" ? "sorted array" : "array" }], steps };
  }

  // ------------------------------------------------------------ layout

  function layoutStructure(kind, state, W) {
    // Returns { pos: {id: {x, y}}, height, extra: [...] } in region coordinates (below the label).
    const pos = {};
    const nodes = state ? state.nodes : [];
    const ptrRows = Math.max(1, ...countPointerStacks(state));
    const top = ptrRows * PTR_ROW + 4;
    if (kind === "array" || kind === "queue") {
      const w = Math.min(NODE_W, Math.max(26, (W - 12) / Math.max(1, nodes.length) - 4));
      nodes.forEach((nd, i) => (pos[nd.id] = { x: 6 + i * (w + 4), y: top, w }));
      return { pos, height: top + NODE_H + 8 };
    }
    if (kind === "stack") {
      nodes.forEach((nd, i) => (pos[nd.id] = { x: 16, y: top + (nodes.length - 1 - i) * (NODE_H + 2), w: 64 }));
      return { pos, height: top + Math.max(1, nodes.length) * (NODE_H + 2) + 10, base: top + nodes.length * (NODE_H + 2) };
    }
    if (kind === "linkedList") {
      const gap = 28;
      const perRow = Math.max(1, Math.floor((W - 12) / (NODE_W + gap)));
      const rowH = top + NODE_H + 26;
      nodes.forEach((nd, i) => (pos[nd.id] = { x: 6 + (i % perRow) * (NODE_W + gap), y: Math.floor(i / perRow) * rowH + top + 14, w: NODE_W }));
      return { pos, height: Math.ceil(Math.max(1, nodes.length) / perRow) * rowH + 18 };
    }
    if (kind === "variables") {
      nodes.forEach((nd, i) => (pos[nd.id] = { x: 6 + (i % 2) * ((W - 12) / 2), y: 4 + Math.floor(i / 2) * (NODE_H + 4), w: (W - 24) / 2 }));
      return { pos, height: Math.ceil(Math.max(1, nodes.length) / 2) * (NODE_H + 4) + 8 };
    }
    if (kind === "hashTable") {
      const groups = [...new Set(nodes.map((x) => x.group))].sort((a, b) => (isNaN(a) || isNaN(b) ? a.localeCompare(b) : a - b));
      const rowOf = Object.fromEntries(groups.map((g, i) => [g, i]));
      const col = {};
      nodes.forEach((nd) => {
        const r = rowOf[nd.group];
        const c = (col[r] = (col[r] ?? -1) + 1);
        pos[nd.id] = { x: 6 + c * (NODE_W + 22), y: 4 + r * (NODE_H + 8), w: NODE_W };
      });
      return { pos, height: Math.max(1, groups.length) * (NODE_H + 8) + 6 };
    }
    if (kind === "tree") {
      const ids = nodes.map((x) => x.id);
      const children = {};
      const hasParent = new Set();
      for (const l of state.links) {
        (children[l.from] = children[l.from] || []).push(l);
        hasParent.add(l.to);
      }
      const roots = ids.filter((id) => !hasParent.has(id));
      let slot = 0;
      let maxDepth = 0;
      const xs = {};
      const depth = {};
      const seen = new Set();
      const place = (id, d) => {
        if (seen.has(id)) return;
        seen.add(id);
        depth[id] = d;
        maxDepth = Math.max(maxDepth, d);
        const ch = children[id] || [];
        const L = ch.find((c) => c.label === "L");
        const R = ch.find((c) => c.label === "R");
        const rest = ch.filter((c) => c !== L && c !== R);
        if (L) place(L.to, d + 1);
        if (L || R || !rest.length) xs[id] = slot++;
        else {
          const half = Math.ceil(rest.length / 2);
          rest.slice(0, half).forEach((c) => place(c.to, d + 1));
          xs[id] = slot++;
          rest.slice(half).forEach((c) => place(c.to, d + 1));
          return;
        }
        if (R) place(R.to, d + 1);
      };
      roots.forEach((r) => place(r, 0));
      ids.forEach((id) => { if (!seen.has(id)) place(id, 0); });
      const sx = slot > 1 ? (W - NODE_W - 12) / (slot - 1) : 0;
      ids.forEach((id) => (pos[id] = { x: 6 + (slot > 1 ? xs[id] * sx : (W - NODE_W) / 2), y: top + depth[id] * 52, w: NODE_W, round: true }));
      return { pos, height: top + (maxDepth + 1) * 52 };
    }
    if (kind === "graph") {
      const R = Math.min(W / 2 - 34, 92);
      const cx = W / 2;
      const cy = top + R + 4;
      nodes.forEach((nd, i) => {
        const a = (2 * Math.PI * i) / Math.max(1, nodes.length) - Math.PI / 2;
        pos[nd.id] = { x: cx + R * Math.cos(a) - NODE_W / 2, y: cy + R * Math.sin(a) - NODE_H / 2, w: NODE_W, round: true };
      });
      return { pos, height: cy + R + NODE_H / 2 + 8 };
    }
    return { pos, height: 40 };
  }

  function countPointerStacks(state) {
    if (!state) return [0];
    const c = {};
    state.pointers.forEach((p) => (c[p.target || "∅"] = (c[p.target || "∅"] || 0) + 1));
    return Object.values(c);
  }

  // ------------------------------------------------------------ player

  let el, onPrediction, onStep, onAsk;
  let scene = null;
  let idx = -1;
  let playing = false;
  let timer = null;
  let pending = null;
  const items = new Map(); // key -> { div, cur: {x,y}, from, to, alive }
  let regions = []; // [{ structure, y, height, layout }]
  let anim = null;
  let stats = { asked: 0, right: 0 };

  function load(s) {
    stop();
    scene = s;
    idx = -1;
    pending = null;
    stats = { asked: 0, right: 0 };
    items.forEach((it) => it.div.remove());
    items.clear();
    el.stage.querySelectorAll(".scene-label").forEach((x) => x.remove());
    el.title.textContent = s.title;
    el.box.hidden = false;
    el.predictBox.hidden = true;
    go(0, true);
  }

  function stateFor(step, sid) {
    for (let i = scene.steps.indexOf(step); i >= 0; i--) {
      const s = scene.steps[i].states.find((x) => x.structure === sid);
      if (s) return s;
    }
    return null;
  }

  function go(i, skipQuestion) {
    if (!scene || i < 0 || i >= scene.steps.length) return false;
    const step = scene.steps[i];
    if (!skipQuestion && i > idx && step.question && el.predict.checked) {
      ask(i);
      return false;
    }
    idx = i;
    render(step);
    el.caption.textContent = step.caption;
    el.counter.textContent = `${i + 1} / ${scene.steps.length}`;
    if (onStep) onStep(i, scene.steps.length);
    el.prev.disabled = i === 0;
    el.next.disabled = i === scene.steps.length - 1;
    return true;
  }

  function ask(i) {
    const q = scene.steps[i].question;
    pending = i;
    const wasPlaying = playing;
    stop();
    el.predictBox.hidden = false;
    el.predictBox.innerHTML = `<div class="q"><i class="codicon codicon-lightbulb"></i>Predict: ${esc(q.text)}</div><div class="row"></div>`;
    if (onAsk) onAsk();
    const row = el.predictBox.querySelector(".row");
    q.options.forEach((opt, k) => {
      const b = document.createElement("button");
      b.textContent = opt;
      b.onclick = () => {
        const right = k === q.answer;
        stats.asked++;
        if (right) stats.right++;
        onPrediction(right);
        pending = null;
        el.predictBox.innerHTML = `<div class="q ${right ? "good" : "bad"}"><i class="codicon codicon-${right ? "pass" : "error"}"></i>${right ? "Yes!" : `Not quite: ${esc(q.options[q.answer])}.`}</div>`;
        go(i, true);
        if (wasPlaying) setTimeout(play, 1100);
      };
      row.appendChild(b);
    });
  }

  function render(step) {
    const W = el.stage.clientWidth || 300;
    // Lay out each structure as a region stacked vertically.
    let y = 0;
    regions = scene.structures.map((s) => {
      const state = stateFor(step, s.id);
      const layout = layoutStructure(s.kind, state, W);
      const r = { structure: s, state, y: y + LABEL_H, layout };
      y += LABEL_H + layout.height + 10;
      return r;
    });
    el.stage.style.height = `${Math.max(120, y)}px`;

    const live = new Set();
    for (const r of regions) {
      const { structure: s, state, layout } = r;
      keyed(`label:${s.id}`, live, () => mk("scene-label", s.label), { x: 2, y: r.y - LABEL_H + 2 });
      if (!state) continue;
      if (s.kind === "stack") keyed(`base:${s.id}`, live, () => mk("stack-base", ""), { x: 10, y: r.y + layout.base + 1 });
      for (const nd of state.nodes) {
        const p = layout.pos[nd.id];
        const text = s.kind === "variables" ? `${nd.id} = ${nd.value}` : nd.value;
        const it = keyed(`n:${s.id}:${nd.id}`, live, () => mk("scene-node", ""), { x: p.x, y: r.y + p.y });
        if (it.div.textContent !== text) {
          if (it.div.textContent) flash(it.div);
          it.div.textContent = text;
        }
        it.div.style.width = `${p.w || NODE_W}px`;
        it.div.classList.toggle("round", !!p.round);
        it.div.classList.toggle("bucket", s.kind === "hashTable" && /^\[.*\]$/.test(nd.value));
        it.div.classList.toggle("var", s.kind === "variables");
        it.div.classList.toggle("hl", state.highlight.includes(nd.id));
      }
      // Pointers stack above their target; null pointers sit in a row on the right.
      const stackCount = {};
      let nullCount = 0;
      for (const ptr of state.pointers) {
        let at;
        if (ptr.target && layout.pos[ptr.target]) {
          const p = layout.pos[ptr.target];
          const k = (stackCount[ptr.target] = (stackCount[ptr.target] || 0) + 1);
          at = s.kind === "stack" ? { x: p.x + (p.w || NODE_W) + 8, y: r.y + p.y + 6 + (k - 1) * PTR_ROW } : { x: p.x, y: r.y + p.y - k * PTR_ROW - 2 };
        } else {
          // Null pointers line up on the right of the structure's label row, out of the way.
          at = { x: Math.max(60, W - 84 * ++nullCount), y: r.y - LABEL_H + 2 };
        }
        const it = keyed(`p:${s.id}:${ptr.name}`, live, () => mk("scene-ptr", ""), at);
        it.div.innerHTML = `${esc(ptr.name)}${ptr.target ? ' <i class="codicon codicon-arrow-down"></i>' : " = null"}`;
        it.div.classList.toggle("null", !ptr.target);
        it.div.classList.toggle("side", s.kind === "stack" && !!ptr.target);
      }
    }
    // Fade out what's gone.
    items.forEach((it, key) => {
      if (!live.has(key) && it.alive) {
        it.alive = false;
        it.div.classList.add("leaving");
        setTimeout(() => {
          it.div.remove();
          // Only forget the key if a newer element hasn't taken it over meanwhile.
          if (items.get(key) === it) items.delete(key);
        }, 300);
      }
    });
    tween();
  }

  function keyed(key, live, make, to) {
    live.add(key);
    let it = items.get(key);
    if (!it || !it.alive) {
      if (it) it.div.remove();
      const div = make();
      el.stage.appendChild(div);
      it = { div, cur: { ...to }, from: { ...to }, to, alive: true };
      div.classList.add("entering");
      items.set(key, it);
      place(it);
    }
    it.from = { ...it.cur };
    it.to = to;
    return it;
  }

  function tween() {
    cancelAnimationFrame(anim);
    if (document.hidden) {
      // No frames are drawn in a hidden view: jump straight to the end.
      items.forEach((it) => { it.cur = { ...it.to }; place(it); });
      return drawLinks();
    }
    const t0 = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / TWEEN_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      items.forEach((it) => {
        it.cur = { x: it.from.x + (it.to.x - it.from.x) * e, y: it.from.y + (it.to.y - it.from.y) * e };
        place(it);
      });
      drawLinks();
      if (t < 1) anim = requestAnimationFrame(frame);
    };
    anim = requestAnimationFrame(frame);
  }

  function place(it) {
    it.div.style.transform = `translate(${it.cur.x}px, ${it.cur.y}px)`;
  }

  function center(sid, id) {
    const it = items.get(`n:${sid}:${id}`);
    if (!it) return null;
    const w = it.div.offsetWidth || NODE_W;
    return { x: it.cur.x + w / 2, y: it.cur.y + NODE_H / 2, w, h: NODE_H };
  }

  function drawLinks() {
    const svg = el.svg;
    svg.setAttribute("width", el.stage.clientWidth);
    svg.setAttribute("height", el.stage.clientHeight);
    svg.textContent = "";
    const defs = document.createElementNS(NS, "defs");
    defs.innerHTML = '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrow-head"/></marker>';
    svg.appendChild(defs);
    for (const r of regions) {
      if (!r.state) continue;
      const kind = r.structure.kind;
      const sid = r.structure.id;
      const links = r.state.links.slice();
      if (kind === "hashTable") {
        // Chain each bucket's entries left to right.
        const byGroup = {};
        r.state.nodes.forEach((nd) => (byGroup[nd.group] = byGroup[nd.group] || []).push(nd.id));
        Object.values(byGroup).forEach((ids) => ids.slice(1).forEach((id, i) => links.push({ from: ids[i], to: id, label: "" })));
      }
      for (const l of links) {
        const a = center(sid, l.from);
        const b = center(sid, l.to);
        if (!a || !b) continue;
        const directed = kind === "linkedList" || kind === "hashTable";
        const path = document.createElementNS(NS, "path");
        let d;
        if (kind === "linkedList" && Math.abs(a.y - b.y) < 4 && b.x < a.x) {
          // A link pointing backwards (a reversed arrow): curve above the nodes.
          const lift = 26 + Math.abs(a.x - b.x) * 0.08;
          d = `M${a.x},${a.y - NODE_H / 2} C${a.x},${a.y - NODE_H / 2 - lift} ${b.x},${b.y - NODE_H / 2 - lift} ${b.x},${b.y - NODE_H / 2}`;
        } else {
          const [sx, sy] = edgePoint(a, b);
          const [ex, ey] = edgePoint(b, a);
          d = `M${sx},${sy} L${ex},${ey}`;
        }
        path.setAttribute("d", d);
        path.setAttribute("class", `scene-link ${r.state.highlight.includes(l.from) && r.state.highlight.includes(l.to) ? "hl" : ""}`);
        if (directed) path.setAttribute("marker-end", "url(#arrow)");
        svg.appendChild(path);
        if (l.label && kind === "graph") {
          const t = document.createElementNS(NS, "text");
          t.setAttribute("x", (a.x + b.x) / 2);
          t.setAttribute("y", (a.y + b.y) / 2 - 3);
          t.setAttribute("class", "scene-link-label");
          t.textContent = l.label;
          svg.appendChild(t);
        }
      }
    }
  }

  function edgePoint(from, to) {
    // Where the line from `from`'s center toward `to` leaves `from`'s box.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (!dx && !dy) return [from.x, from.y];
    const sx = from.w / 2 / Math.abs(dx || 1e-9);
    const sy = from.h / 2 / Math.abs(dy || 1e-9);
    const s = Math.min(sx, sy) + 0.02;
    return [from.x + dx * s, from.y + dy * s];
  }

  function mk(cls, text) {
    const d = document.createElement("div");
    d.className = cls;
    d.textContent = text;
    return d;
  }

  function flash(div) {
    div.classList.remove("changed");
    void div.offsetWidth;
    div.classList.add("changed");
  }

  function play() {
    if (!scene) return;
    if (pending !== null) return ask(pending);
    if (idx >= scene.steps.length - 1) go(0, true);
    playing = true;
    el.play.innerHTML = '<i class="codicon codicon-debug-pause"></i>Pause';
    const loop = () => {
      if (!playing) return;
      if (idx >= scene.steps.length - 1) return stop();
      if (go(idx + 1)) timer = setTimeout(loop, 1700);
    };
    timer = setTimeout(loop, 900);
  }

  function stop() {
    playing = false;
    clearTimeout(timer);
    if (el) el.play.innerHTML = '<i class="codicon codicon-play"></i>Play';
  }

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /** Where the student should look: the middle of the highlighted nodes, in stage pixels. */
  function focusPoint() {
    if (!scene || idx < 0) return null;
    const step = scene.steps[idx];
    const pts = [];
    for (const r of regions) {
      if (!r.state) continue;
      for (const id of r.state.highlight) {
        const it = items.get(`n:${r.structure.id}:${id}`);
        if (it) pts.push({ x: it.to.x + (it.div.offsetWidth || NODE_W) / 2, y: it.to.y });
      }
    }
    if (!pts.length) return null;
    return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: Math.min(...pts.map((p) => p.y)), step };
  }

  function init(elements, callbacks) {
    el = elements;
    onPrediction = callbacks.onPrediction;
    onStep = callbacks.onStep;
    onAsk = callbacks.onAsk;
    el.play.onclick = () => (playing ? stop() : play());
    el.next.onclick = () => {
      stop();
      if (pending !== null) return ask(pending);
      el.predictBox.hidden = true;
      go(idx + 1);
    };
    el.prev.onclick = () => {
      stop();
      pending = null;
      el.predictBox.hidden = true;
      go(idx - 1, true);
    };
    new ResizeObserver(() => scene && idx >= 0 && render(scene.steps[idx])).observe(el.stage);
  }

  window.ScenePlayer = { init, load, EXAMPLES, algoScene, focusPoint };
})();
