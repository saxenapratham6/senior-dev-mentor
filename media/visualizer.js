// Algorithm visualizer. Each algorithm is a generator yielding steps; the
// player applies them to the picture. In predict mode, some steps carry a
// question the student answers before the step is shown.
(function () {
  const NS = "http://www.w3.org/2000/svg";

  const PSEUDO = {
    bubble: ["repeat until no swaps:", "  for i in 0 .. n-2:", "    if a[i] > a[i+1]:", "      swap a[i], a[i+1]", "  last element is now in place"],
    selection: ["for i in 0 .. n-1:", "  min = i", "  for j in i+1 .. n-1:", "    if a[j] < a[min]: min = j", "  swap a[i], a[min]"],
    insertion: ["for i in 1 .. n-1:", "  key = a[i]; j = i - 1", "  while j >= 0 and a[j] > key:", "    a[j+1] = a[j]; j = j - 1", "  a[j+1] = key"],
    merge: ["mergeSort(lo, hi):", "  if hi - lo < 1: return", "  mid = (lo + hi) / 2", "  mergeSort(lo, mid); mergeSort(mid+1, hi)", "  merge the two sorted halves:", "    take the smaller front element each time"],
    quick: ["quickSort(lo, hi):", "  if lo >= hi: return", "  pivot = a[hi]", "  for j in lo .. hi-1:", "    if a[j] < pivot: swap it into the left part", "  put pivot between the parts", "  quickSort(left part); quickSort(right part)"],
    binary: ["lo = 0, hi = n - 1", "while lo <= hi:", "  mid = (lo + hi) / 2", "  if a[mid] == target: found!", "  if target < a[mid]: hi = mid - 1", "  else: lo = mid + 1", "not found"],
    bst: ["insert(node, v):", "  if node is empty: put v here", "  if v < node.value: insert(node.left, v)", "  else: insert(node.right, v)"],
  };

  const yesNo = (text, answer) => ({ text, options: ["Yes", "No"], answer: answer ? 0 : 1 });

  function* bubble(a) {
    const n = a.length;
    for (let end = n - 1; end > 0; end--) {
      let swapped = false;
      for (let i = 0; i < end; i++) {
        yield { type: "compare", i, j: i + 1, line: 2, caption: `Compare ${a[i]} and ${a[i + 1]}`, q: yesNo(`Will ${a[i]} and ${a[i + 1]} swap?`, a[i] > a[i + 1]) };
        if (a[i] > a[i + 1]) {
          [a[i], a[i + 1]] = [a[i + 1], a[i]];
          swapped = true;
          yield { type: "swap", i, j: i + 1, line: 3, caption: `${a[i + 1]} > ${a[i]}, so swap` };
        }
      }
      yield { type: "sorted", idx: [end], line: 4, caption: `${a[end]} has bubbled to its final spot` };
      if (!swapped) {
        yield { type: "sorted", idx: [...Array(end).keys()], line: 0, caption: "A full pass with no swaps: the array is sorted, so we can stop early" };
        return;
      }
    }
    yield { type: "sorted", idx: [0], line: 0, caption: "Done" };
  }

  function* selection(a) {
    const n = a.length;
    for (let i = 0; i < n - 1; i++) {
      let min = i;
      yield { type: "mark", i: min, line: 1, caption: `Assume ${a[i]} is the smallest so far` };
      for (let j = i + 1; j < n; j++) {
        yield { type: "compare", i: min, j, line: 3, caption: `Is ${a[j]} smaller than ${a[min]}?`, q: yesNo(`Is ${a[j]} the new smallest (smaller than ${a[min]})?`, a[j] < a[min]) };
        if (a[j] < a[min]) {
          min = j;
          yield { type: "mark", i: min, line: 3, caption: `New smallest: ${a[min]}` };
        }
      }
      if (min !== i) {
        [a[i], a[min]] = [a[min], a[i]];
        yield { type: "swap", i, j: min, line: 4, caption: `Swap ${a[i]} into position ${i}` };
      }
      yield { type: "sorted", idx: [i], line: 4, caption: `${a[i]} is in place` };
    }
    yield { type: "sorted", idx: [n - 1], line: 0, caption: "Done" };
  }

  function* insertion(a) {
    yield { type: "sorted", idx: [0], line: 0, caption: "One element on its own is already sorted" };
    for (let i = 1; i < a.length; i++) {
      const key = a[i];
      let j = i - 1;
      yield { type: "mark", i, line: 1, caption: `Pick up ${key} and insert it into the sorted part on the left` };
      while (j >= 0) {
        yield { type: "compare", i: j, j: j + 1, line: 2, caption: `Is ${a[j]} > ${key}?`, q: yesNo(`Does ${a[j]} need to shift right to make room for ${key}?`, a[j] > key) };
        if (a[j] <= key) break;
        a[j + 1] = a[j];
        a[j] = key;
        yield { type: "swap", i: j, j: j + 1, line: 3, caption: `${a[j + 1]} shifts right` };
        j--;
      }
      yield { type: "sorted", idx: [...Array(i + 1).keys()], line: 4, caption: `${key} is placed; the first ${i + 1} are sorted` };
    }
  }

  function* merge(a) {
    function* sort(lo, hi) {
      if (hi - lo < 1) return;
      const mid = (lo + hi) >> 1;
      yield { type: "range", lo, hi, line: 2, caption: `Split [${lo}..${hi}] into [${lo}..${mid}] and [${mid + 1}..${hi}]` };
      yield* sort(lo, mid);
      yield* sort(mid + 1, hi);
      const left = a.slice(lo, mid + 1);
      const right = a.slice(mid + 1, hi + 1);
      yield { type: "range", lo, hi, line: 4, caption: `Merge [${left.join(", ")}] and [${right.join(", ")}]` };
      let i = 0, j = 0, k = lo;
      while (i < left.length && j < right.length) {
        const takeLeft = left[i] <= right[j];
        yield { type: "compare", i: lo + i, j: mid + 1 + j, line: 5, caption: `Fronts are ${left[i]} and ${right[j]}`, q: { text: `Which comes next: ${left[i]} (left) or ${right[j]} (right)?`, options: [`${left[i]}`, `${right[j]}`], answer: takeLeft ? 0 : 1 } };
        a[k] = takeLeft ? left[i++] : right[j++];
        yield { type: "set", i: k, value: a[k], line: 5, caption: `Write ${a[k]}` };
        k++;
      }
      while (i < left.length) { a[k] = left[i++]; yield { type: "set", i: k, value: a[k], line: 5, caption: `Copy leftover ${a[k]}` }; k++; }
      while (j < right.length) { a[k] = right[j++]; yield { type: "set", i: k, value: a[k], line: 5, caption: `Copy leftover ${a[k]}` }; k++; }
    }
    yield* sort(0, a.length - 1);
    yield { type: "sorted", idx: [...a.keys()], line: 0, caption: "Done: every half was merged back in order" };
  }

  function* quick(a) {
    function* sort(lo, hi) {
      if (lo >= hi) {
        if (lo === hi) yield { type: "sorted", idx: [lo], line: 1, caption: `${a[lo]} alone is in place` };
        return;
      }
      const pivot = a[hi];
      yield { type: "range", lo, hi, line: 2, caption: `Partition [${lo}..${hi}] around pivot ${pivot}` };
      yield { type: "pivot", i: hi, line: 2, caption: `Pivot = ${pivot}` };
      let p = lo;
      for (let j = lo; j < hi; j++) {
        yield { type: "compare", i: j, j: hi, line: 4, caption: `Is ${a[j]} < ${pivot}?`, q: yesNo(`Does ${a[j]} belong left of the pivot ${pivot}?`, a[j] < pivot) };
        if (a[j] < pivot) {
          if (p !== j) {
            [a[p], a[j]] = [a[j], a[p]];
            yield { type: "swap", i: p, j, line: 4, caption: `Move ${a[p]} into the left part` };
          }
          p++;
        }
      }
      [a[p], a[hi]] = [a[hi], a[p]];
      yield { type: "swap", i: p, j: hi, line: 5, caption: `Put pivot ${pivot} between the parts` };
      yield { type: "sorted", idx: [p], line: 5, caption: `${pivot} is in its final spot` };
      yield* sort(lo, p - 1);
      yield* sort(p + 1, hi);
    }
    yield* sort(0, a.length - 1);
    yield { type: "sorted", idx: [...a.keys()], line: 0, caption: "Done" };
  }

  function* binary(a, target) {
    let lo = 0, hi = a.length - 1;
    yield { type: "range", lo, hi, line: 0, caption: `Looking for ${target} in a sorted array` };
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const ans = a[mid] === target ? 0 : target < a[mid] ? 1 : 2;
      yield { type: "compare", i: mid, j: mid, line: 2, caption: `mid = ${mid}, a[mid] = ${a[mid]}`, q: { text: `a[mid] is ${a[mid]}, target is ${target}. What next?`, options: ["Found it", "Go left", "Go right"], answer: ans } };
      if (ans === 0) {
        yield { type: "sorted", idx: [mid], line: 3, caption: `Found ${target} at index ${mid}, after looking at only a few elements` };
        return;
      }
      if (ans === 1) hi = mid - 1;
      else lo = mid + 1;
      yield { type: "range", lo, hi, line: ans === 1 ? 4 : 5, caption: ans === 1 ? `${target} < ${a[mid]}, so throw away the right half` : `${target} > ${a[mid]}, so throw away the left half` };
    }
    yield { type: "range", lo: 1, hi: 0, line: 6, caption: `${target} isn't in the array; the search space is empty` };
  }

  function* bst(values) {
    const nodes = []; // {v, left, right}
    for (const v of values) {
      if (!nodes.length) {
        nodes.push({ v, left: -1, right: -1 });
        yield { type: "bst", nodes: clone(nodes), at: 0, line: 1, caption: `Tree is empty, so ${v} becomes the root` };
        continue;
      }
      let cur = 0;
      for (;;) {
        const n = nodes[cur];
        const goLeft = v < n.v;
        yield { type: "bst", nodes: clone(nodes), at: cur, line: goLeft ? 2 : 3, caption: `Insert ${v}: compare with ${n.v}`, q: { text: `Inserting ${v}. At ${n.v}: go left or right?`, options: ["Left", "Right"], answer: goLeft ? 0 : 1 } };
        const side = goLeft ? "left" : "right";
        if (n[side] === -1) {
          nodes.push({ v, left: -1, right: -1 });
          n[side] = nodes.length - 1;
          yield { type: "bst", nodes: clone(nodes), at: nodes.length - 1, line: 1, caption: `Empty spot ${side} of ${n.v}: place ${v}` };
          break;
        }
        cur = n[side];
      }
    }
    yield { type: "bst", nodes: clone(nodes), at: -1, line: 0, caption: "Done. An in-order walk (left, node, right) visits these in sorted order" };
  }

  const clone = (nodes) => nodes.map((n) => ({ ...n }));
  const ALGOS = { bubble, selection, insertion, merge, quick, binary, bst };

  // ---------------------------------------------------------------- player

  let el, onPrediction;
  let data = [], view = [], target = null;
  let gen = null, timer = null, compares = 0, playing = false, pending = null;
  let marks = {}, sortedSet = new Set(), range = null, tree = null, lastStep = null;
  let stats = { steps: 0, compares: 0, swaps: 0, right: 0, asked: 0 };

  function randomData() {
    const n = +el.size.value;
    const algo = el.algo.value;
    if (algo === "bst") {
      const pool = [...Array(40).keys()].map((x) => x + 1).sort(() => Math.random() - 0.5);
      data = pool.slice(0, Math.min(n, 12));
    } else {
      data = Array.from({ length: n }, () => 2 + Math.floor(Math.random() * 40));
      if (algo === "binary") {
        data = [...new Set(data)].sort((x, y) => x - y);
        target = Math.random() < 0.8 ? data[Math.floor(Math.random() * data.length)] : 43;
      }
    }
    reset();
  }

  function reset() {
    stop();
    view = data.slice();
    marks = {};
    sortedSet = new Set();
    range = null;
    tree = null;
    lastStep = null;
    compares = 0;
    pending = null;
    stats = { steps: 0, compares: 0, swaps: 0, right: 0, asked: 0 };
    gen = ALGOS[el.algo.value](data.slice(), target);
    el.predictBox.hidden = true;
    el.pseudo.innerHTML = PSEUDO[el.algo.value].map((l, i) => `<span data-line="${i}">${escapeHtml(l)}</span>`).join("\n");
    caption(el.algo.value === "binary" ? `Target: ${target}. Press Play or Step.` : "Press Play, or Step through one move at a time.");
    draw();
  }

  function apply(s) {
    marks = {};
    stats.steps++;
    switch (s.type) {
      case "compare": marks[s.i] = "compare"; marks[s.j] = "compare"; stats.compares++; break;
      case "swap": [view[s.i], view[s.j]] = [view[s.j], view[s.i]]; marks[s.i] = "swap"; marks[s.j] = "swap"; stats.swaps++; break;
      case "set": view[s.i] = s.value; marks[s.i] = "swap"; stats.swaps++; break;
      case "mark": marks[s.i] = "pivot"; break;
      case "pivot": marks[s.i] = "pivot"; break;
      case "sorted": s.idx.forEach((i) => sortedSet.add(i)); break;
      case "range": range = [s.lo, s.hi]; break;
      case "bst": tree = s; if (s.q) stats.compares++; break;
    }
    lastStep = s;
    caption(s.caption);
    highlight(s.line);
    draw();
  }

  /** Advance one step. Returns false at the end, or when waiting on a prediction. */
  function next() {
    if (pending) {
      ask(pending);
      return false;
    }
    if (!gen) return false;
    const r = gen.next();
    if (r.done) {
      stop();
      gen = null;
      marks = {};
      draw();
      el.vizStats.textContent = summary();
      return false;
    }
    const s = r.value;
    if (s.q && el.predict.checked && (s.type !== "compare" || ++compares % 2 === 1)) {
      // Show the setup (what is being compared) before asking.
      marks = {};
      if (s.type === "compare") { marks[s.i] = "compare"; marks[s.j] = "compare"; }
      if (s.type === "bst") tree = { ...s, at: s.at };
      highlight(s.line);
      draw();
      ask(s);
      return false;
    }
    apply(s);
    el.vizStats.textContent = summary();
    return true;
  }

  function ask(s) {
    pending = s;
    const wasPlaying = playing;
    stop();
    el.predictBox.hidden = false;
    el.predictBox.innerHTML = `<div class="q"><i class="codicon codicon-lightbulb"></i>Predict: ${escapeHtml(s.q.text)}</div><div class="row"></div>`;
    const row = el.predictBox.querySelector(".row");
    s.q.options.forEach((opt, idx) => {
      const b = document.createElement("button");
      b.textContent = opt;
      b.onclick = () => {
        pending = null;
        const right = idx === s.q.answer;
        stats.asked++;
        if (right) stats.right++;
        onPrediction(right);
        el.predictBox.innerHTML = `<div class="q ${right ? "good" : "bad"}">${right ? '<i class="codicon codicon-pass"></i>Yes! ' : '<i class="codicon codicon-error"></i>Not quite. '}${escapeHtml(s.caption)}</div>`;
        apply(s);
        el.vizStats.textContent = summary();
        if (wasPlaying) setTimeout(play, 900);
      };
      row.appendChild(b);
    });
  }

  function summary() {
    const n = view.length;
    let s = `${stats.steps} steps · ${stats.compares} comparisons · ${stats.swaps} writes/swaps`;
    if (el.algo.value !== "bst" && el.algo.value !== "binary") s += ` · n = ${n}, n² = ${n * n}, n·log₂n ≈ ${Math.round(n * Math.log2(n))}`;
    if (stats.asked) s += ` · predictions ${stats.right}/${stats.asked}`;
    return s;
  }

  function delay() {
    return 1150 - +el.speed.value * 105;
  }

  function play() {
    if (!gen) reset();
    playing = true;
    el.play.innerHTML = '<i class="codicon codicon-debug-pause"></i>Pause';
    if (!pending) el.predictBox.hidden = true;
    const loop = () => {
      if (!playing) return;
      if (next()) timer = setTimeout(loop, delay());
    };
    loop();
  }

  function stop() {
    playing = false;
    clearTimeout(timer);
    if (el) el.play.innerHTML = '<i class="codicon codicon-play"></i>Play';
  }

  // ---------------------------------------------------------------- drawing

  function draw() {
    const svg = el.canvas;
    const W = svg.clientWidth || 300;
    const H = 170;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";
    if (el.algo.value === "bst") return drawTree(svg, W, H);
    const n = view.length;
    const gap = 3;
    const bw = Math.max(6, (W - gap * (n + 1)) / n);
    const max = Math.max(...view, 1);
    view.forEach((v, i) => {
      const h = Math.max(8, (v / max) * (H - 30));
      const xPos = gap + i * (bw + gap);
      const dim = range && (i < range[0] || i > range[1]);
      const cls = ["bar", marks[i] || "", sortedSet.has(i) ? "sorted" : "", dim ? "dim" : ""].join(" ");
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("x", xPos); r.setAttribute("y", H - 16 - h);
      r.setAttribute("width", bw); r.setAttribute("height", h); r.setAttribute("rx", 2);
      r.setAttribute("class", cls);
      svg.appendChild(r);
      if (bw >= 12) {
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", xPos + bw / 2); t.setAttribute("y", H - 4);
        t.setAttribute("class", "bar-label"); t.textContent = v;
        svg.appendChild(t);
      }
    });
  }

  function drawTree(svg, W, H) {
    if (!tree || !tree.nodes.length) {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", W / 2); t.setAttribute("y", H / 2); t.setAttribute("class", "bar-label");
      t.textContent = `Will insert: ${data.join(", ")}`;
      svg.appendChild(t);
      return;
    }
    const nodes = tree.nodes;
    const pos = [];
    let order = 0;
    let depthMax = 0;
    (function walk(i, d) {
      if (i === -1) return;
      walk(nodes[i].left, d + 1);
      pos[i] = { x: order++, d };
      depthMax = Math.max(depthMax, d);
      walk(nodes[i].right, d + 1);
    })(0, 0);
    const sx = (W - 30) / Math.max(1, nodes.length - 1);
    const sy = (H - 30) / Math.max(1, depthMax);
    const P = (i) => ({ x: 15 + pos[i].x * (nodes.length > 1 ? sx : 0) + (nodes.length > 1 ? 0 : W / 2 - 15), y: 15 + pos[i].d * Math.min(sy, 40) });
    nodes.forEach((n, i) => {
      for (const c of [n.left, n.right]) {
        if (c === -1) continue;
        const a = P(i), b = P(c);
        const l = document.createElementNS(NS, "line");
        l.setAttribute("x1", a.x); l.setAttribute("y1", a.y); l.setAttribute("x2", b.x); l.setAttribute("y2", b.y);
        l.setAttribute("class", "edge");
        svg.appendChild(l);
      }
    });
    nodes.forEach((n, i) => {
      const p = P(i);
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", 11);
      c.setAttribute("class", `node ${i === tree.at ? "compare" : ""}`);
      svg.appendChild(c);
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", p.x); t.setAttribute("y", p.y + 4); t.setAttribute("class", "node-label");
      t.textContent = n.v;
      svg.appendChild(t);
    });
  }

  function caption(text) {
    el.vizCaption.textContent = text;
  }

  function highlight(line) {
    el.pseudo.querySelectorAll("span").forEach((s) => s.classList.toggle("on", +s.dataset.line === line));
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function init(elements, callbacks) {
    el = elements;
    onPrediction = callbacks.onPrediction;
    el.algo.onchange = randomData;
    el.size.oninput = randomData;
    el.shuffle.onclick = randomData;
    el.play.onclick = () => (playing ? stop() : play());
    el.step.onclick = () => {
      stop();
      if (!gen) reset();
      if (!pending) el.predictBox.hidden = true;
      next();
    };
    new ResizeObserver(() => draw()).observe(el.canvas);
    randomData();
  }

  window.Visualizer = { init, ALGOS };
})();
