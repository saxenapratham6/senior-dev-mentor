---
id: heap-patterns
unit: 3
title: "Heap patterns: top k, k-way merge, two heaps"
minutes: 40
summary: Three heap patterns cover most "k" problems. A size-k heap keeps the top k, a heap of list heads merges k sorted lists, and two heaps split a stream in half to track its median.
---

## Signals
- "k largest", "k smallest", "k most frequent", "k closest"
- Merge k sorted lists or arrays, or "smallest range covering k lists"
- A running median, or balancing two halves of a stream
- Repeatedly take the best available option (schedulers, greedy with a heap)
- Shortest paths with weights (Dijkstra)

## Top k by frequency

Count, then keep the k best. `heapq.nlargest(k, items, key=...)` uses a size-k heap internally: O(n log k).

```python
import heapq
from collections import Counter

def top_k_words(words, k):
    counts = Counter(words)
    return heapq.nsmallest(k, counts, key=lambda w: (-counts[w], w))

print(top_k_words(["i", "love", "code", "i", "love", "python", "i"], 2))
```

Using `nsmallest` with a negated count makes ties break alphabetically: the key `(-count, word)` is smallest for the most frequent, then earliest word.

## Worked example: sort a nearly sorted array

Every element is at most k positions away from where it belongs. A min-heap of the next k + 1 items always contains the true next element: O(n log k) instead of O(n log n).

```python
import heapq

def sort_nearly_sorted(nums, k):
    heap = nums[:k + 1]
    heapq.heapify(heap)
    out = []
    for x in nums[k + 1:]:
        out.append(heapq.heappushpop(heap, x))
    while heap:
        out.append(heapq.heappop(heap))
    return out

print(sort_nearly_sorted([6, 5, 3, 2, 8, 10, 9], 3))
```

`heappushpop` pushes the new item and pops the smallest in a single O(log k) step.

## K-way merge

Put the first item of each sorted list in a heap as `(value, list_index, position)`. Pop the smallest, then push the next item from the same list.

```python
import heapq

def merge_k(lists):
    heap = [(lst[0], i, 0) for i, lst in enumerate(lists) if lst]
    heapq.heapify(heap)
    out = []
    while heap:
        val, i, j = heapq.heappop(heap)
        out.append(val)
        if j + 1 < len(lists[i]):
            heapq.heappush(heap, (lists[i][j + 1], i, j + 1))
    return out

print(merge_k([[1, 4, 7], [2, 5], [0, 3, 6, 9], []]))
```

The list index in the tuple breaks ties, so values never need to be compared with something else.

## Two heaps: a running median

Keep the smaller half in a max-heap (negated) and the larger half in a min-heap. Balance them so their sizes differ by at most one; the median sits on top.

```python
import heapq

class RunningMedian:
    def __init__(self):
        self.low = []
        self.high = []

    def add(self, x):
        heapq.heappush(self.low, -x)
        heapq.heappush(self.high, -heapq.heappop(self.low))
        if len(self.high) > len(self.low):
            heapq.heappush(self.low, -heapq.heappop(self.high))

    def median(self):
        if len(self.low) > len(self.high):
            return -self.low[0]
        return (-self.low[0] + self.high[0]) / 2

rm = RunningMedian()
for x in [5, 15, 1, 3, 8]:
    rm.add(x)
    print(x, rm.median())
```

Pushing through `low` and then into `high` keeps every item in `low` no bigger than every item in `high`.

## Compare: Which heap pattern?

| Problem shape | Heap | Size | Cost |
|---|---|---|---|
| Top k of n | Min-heap of the best so far | k | O(n log k) |
| Merge k sorted lists of N total items | Min-heap of list heads | k | O(N log k) |
| Running median | Max-heap of lower half + min-heap of upper half | n | O(log n) per add |
| Always take the cheapest next option | Min-heap of options | Varies | O(log n) per step |

## Pitfall: Re-sorting on every insert

```python
import heapq
import time

def median_by_sorting(stream):
    seen, out = [], []
    for x in stream:
        seen.append(x)
        seen.sort()
        out.append(seen[len(seen) // 2])
    return out

def median_by_heaps(stream):
    low, high, out = [], [], []
    for x in stream:
        heapq.heappush(low, -x)
        heapq.heappush(high, -heapq.heappop(low))
        if len(high) > len(low):
            heapq.heappush(low, -heapq.heappop(high))
        out.append(-low[0] if len(low) > len(high) else high[0])
    return out

data = [(i * 7919) % 10007 for i in range(3000)]
print(median_by_sorting(data)[-5:] == median_by_heaps(data)[-5:])
```

Both give the same answers, but sorting after every insert is O(n log n) per item, O(n² log n) overall. The two-heap version is O(log n) per item. (For even counts both return the upper middle here.)

## Quiz

### To find the k largest of n numbers, which heap do you maintain?
- [x] A min-heap of size k
- [ ] A max-heap of size k
- [ ] A min-heap of all n numbers
Why: The min-heap's root is the weakest of your current top k, so any bigger number replaces it.

### In the running median, what does the top of the max-heap `low` represent?
- [ ] The overall maximum
- [x] The largest item in the lower half
- [ ] The smallest item overall
Why: `low` holds the smaller half; its top is the biggest of those, right next to the median.

## Exercise: task-order | Most frequent first, with a cooldown
Each task is a letter. The same letter must be separated by at least `n` other slots (other tasks or idle). Write `least_intervals(tasks, n)` that returns the minimum number of slots to finish every task. Simulate with a max-heap of remaining counts: each round of `n + 1` slots, take up to `n + 1` different tasks with the most remaining.

```python starter
import heapq
from collections import Counter


def least_intervals(tasks, n):
    # TODO: rounds of n + 1 slots, greedily taking the most frequent remaining tasks
    pass
```

```python checks
check("example", lambda: least_intervals(list("AAABBB"), 2), 8)
check("no cooldown", lambda: least_intervals(list("AAABBB"), 0), 6)
check("idles needed", lambda: least_intervals(list("AAAAAABCDEFG"), 2), 16)
check("single task", lambda: least_intervals(["A"], 5), 1)
check("many kinds", lambda: least_intervals(list("ABCDEFGH") * 3, 2), 24)
```

## Ladder
- easy: Kth Largest Element in a Stream
- easy: Last Stone Weight
- medium: Top K Frequent Elements
- medium: K Closest Points to Origin
- medium: Task Scheduler
- medium: Kth Largest Element in an Array
- hard: Find Median from Data Stream
- hard: IPO
- hard: Smallest Range Covering Elements from K Lists
