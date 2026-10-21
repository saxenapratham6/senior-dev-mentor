// Step generators for the built-in sorting and searching animations. Each
// yields steps (compare, swap, set, ...); scene.js replays them as snapshots.
// Some steps carry a question the student answers in predict mode.
(function () {
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

  window.Visualizer = { ALGOS };
})();
