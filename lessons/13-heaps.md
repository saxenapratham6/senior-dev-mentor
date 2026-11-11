---
id: heaps
unit: 2
title: Heaps with heapq
minutes: 25
summary: A heap always gives you its smallest item in O(log n). Whenever a problem says "k largest", "k closest", "next earliest" or "keep merging the smallest", a heap is usually the answer.
---

## A min-heap in a plain list

`heapq` keeps a list arranged so that `heap[0]` is always the smallest item. `heappush` and `heappop` are O(log n), `heapify` turns a list into a heap in O(n), and peeking at `heap[0]` is O(1).

```python
import heapq

heap = []
for x in [5, 1, 8, 3, 2]:
    heapq.heappush(heap, x)
print(heap[0])
print([heapq.heappop(heap) for _ in range(3)])

nums = [9, 4, 7, 1]
heapq.heapify(nums)
print(nums[0], len(nums))
```

The list isn't fully sorted; only the smallest item is guaranteed to be at the front.

## Max-heap: store negatives

`heapq` only does min-heaps. To pop the largest first, push `-x` and negate again when you pop.

```python
import heapq

stones = [2, 7, 4, 1, 8, 1]
heap = [-s for s in stones]
heapq.heapify(heap)
largest = -heapq.heappop(heap)
second = -heapq.heappop(heap)
print(largest, second)
```

## Priorities with tuples

Push `(priority, item)` tuples: the heap orders by priority, then by item. Add a counter as a tie-breaker when items themselves can't be compared, like dicts or custom objects.

```python
import heapq
from itertools import count

order = count()
jobs = []
heapq.heappush(jobs, (2, next(order), {"name": "email"}))
heapq.heappush(jobs, (1, next(order), {"name": "deploy"}))
heapq.heappush(jobs, (2, next(order), {"name": "lunch"}))
while jobs:
    priority, _, job = heapq.heappop(jobs)
    print(priority, job["name"])
```

## Top k with a heap of size k

To keep the k largest items from a long stream, keep a **min-heap of size k**: its smallest item is the weakest of the current top k, so anything bigger replaces it. That's O(n log k) time and O(k) memory.

```python
import heapq

def top_k(nums, k):
    heap = []
    for x in nums:
        if len(heap) < k:
            heapq.heappush(heap, x)
        elif x > heap[0]:
            heapq.heapreplace(heap, x)
    return sorted(heap, reverse=True)

print(top_k([5, 1, 9, 3, 7, 2, 8], 3))
print(heapq.nlargest(3, [5, 1, 9, 3, 7, 2, 8]))
print(heapq.nsmallest(2, ["pear", "fig", "banana"], key=len))
```

`heapreplace` pops the smallest and pushes the new item in one O(log k) step.

## Merging sorted lists

A heap holding one item from each list always knows which list has the overall smallest next value. `heapq.merge` does this for you, lazily.

```python
import heapq

a, b, c = [1, 4, 9], [2, 3, 10], [0, 5]
print(list(heapq.merge(a, b, c)))
```

## Compare: Sorting or a heap?

| Need | Sort | Heap |
|---|---|---|
| Everything in order, once | O(n log n), simplest | No benefit |
| Only the top k of n items | O(n log n) | O(n log k) with a size-k heap |
| Items arrive over time; always take the smallest so far | Re-sort each time: slow | O(log n) per push and pop |
| Merge k sorted lists | Concatenate and sort: O(N log N) | O(N log k) |

## Pitfall: Popping the "largest" from a min-heap

```python
import heapq

h = [1, 10, 2, 11, 12, 3]
heapq.heapify(h)
print(h)
print(h[-1], max(h))
```

`heappop` always returns the smallest, and the last element of the list is **not** the largest. Negate values for a max-heap.

## Pitfall: Comparing things that can't be compared

```python
import heapq

h = []
heapq.heappush(h, (1, {"task": "a"}))
try:
    heapq.heappush(h, (1, {"task": "b"}))
except TypeError as e:
    print("TypeError:", e)
```

With equal priorities, the heap compares the second items, and dicts can't be compared. Put a unique counter between them: `(priority, next(counter), item)`.

## Quiz

### What's the cost of `heapq.heappop(h)` on a heap of n items?
- [ ] O(1)
- [x] O(log n)
- [ ] O(n)
Why: It removes the root and sifts the last item down one level per step, about log n levels.

### How do you get the largest item first with heapq?
- [ ] `heapq.heappop(h, reverse=True)`
- [x] Push negated values and negate them when you pop
- [ ] Read `h[-1]`
Why: heapq only provides a min-heap. Negating flips the order.

### To keep the top 10 of a million numbers, which heap do you keep?
- [x] A min-heap of size 10
- [ ] A max-heap of all million numbers
- [ ] A min-heap of all million numbers
Why: The size-10 min-heap's root is the weakest of the top 10, so you can compare each new number against it in O(1) and replace it in O(log 10).

## Exercise: k-closest | K closest points
Write `k_closest(points, k)` that returns the `k` points closest to the origin, as a list sorted from closest to farthest (ties broken by the point itself). Use `heapq.nsmallest` with a key, or a heap of size k.

```python starter
import heapq


def k_closest(points, k):
    # TODO: compare squared distances; no need for square roots
    pass
```

```python checks
check("basic", lambda: k_closest([(1, 3), (-2, 2), (5, 8), (0, 1)], 2), [(0, 1), (-2, 2)])
check("all", lambda: k_closest([(3, 3), (1, 1)], 2), [(1, 1), (3, 3)])
check("ties", lambda: k_closest([(1, 0), (0, 1), (0, -1)], 2), [(0, -1), (0, 1)])
check("k zero", lambda: k_closest([(1, 1)], 0), [])
```

## Exercise: last-stone | Smash the two heaviest
Each turn, take the two heaviest stones `x <= y`. If they're equal both are destroyed; otherwise a stone of weight `y - x` goes back. Write `last_stone(stones)` that returns the weight of the last stone, or 0 if none are left. Use a max-heap (negated values).

```python starter
import heapq


def last_stone(stones):
    # TODO: max-heap via negatives
    pass
```

```python checks
check("basic", lambda: last_stone([2, 7, 4, 1, 8, 1]), 1)
check("one stone", lambda: last_stone([5]), 5)
check("all cancel", lambda: last_stone([3, 3]), 0)
check("empty", lambda: last_stone([]), 0)
check("big", lambda: last_stone(list(range(1, 20001))), 0)
```
