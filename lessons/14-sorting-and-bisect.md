---
id: sorting-and-bisect
unit: 2
title: Sorting and searching sorted data
minutes: 30
summary: Sorting is often the first move that makes a hard problem easy, and once data is sorted, binary search finds things in O(log n). Learn key functions, stability and bisect, then write binary search yourself without off-by-one bugs.
---

## Key functions decide the order

`sorted` and `.sort` call your `key` function once per item and sort by its result. Return a tuple to sort by several things; negate numbers to flip just that part.

```python
people = [("ana", 21, 3.9), ("bo", 19, 3.5), ("cy", 21, 3.7), ("di", 19, 3.9)]
by_age = sorted(people, key=lambda p: p[1])
by_gpa_then_name = sorted(people, key=lambda p: (-p[2], p[0]))
print([p[0] for p in by_age])
print([p[0] for p in by_gpa_then_name])
```

Sorting is **stable**: items with equal keys keep their original order. That's why `ana` stays before `cy` when sorting by age.

## Sorting first makes problems easier

Many problems become simple once the data is sorted: duplicates sit next to each other, intervals can be merged left to right, and two pointers can close in from both ends.

```python
def has_close_pair(nums, gap):
    nums = sorted(nums)
    return any(b - a <= gap for a, b in zip(nums, nums[1:]))

def merge_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged

print(has_close_pair([10, 1, 15, 7], 3))
print(merge_intervals([(8, 10), (1, 3), (2, 6), (15, 18)]))
```

## bisect: binary search for free

`bisect_left(a, x)` returns the first index where `x` could be inserted to keep `a` sorted, before any equal items. `bisect_right` returns the index after any equal items. `insort` inserts in order.

```python
from bisect import bisect_left, bisect_right, insort

a = [1, 3, 3, 3, 7, 9]
print(bisect_left(a, 3), bisect_right(a, 3))
print(bisect_right(a, 3) - bisect_left(a, 3))
print(bisect_left(a, 5), bisect_left(a, 100))
insort(a, 4)
print(a)
```

`bisect_right - bisect_left` counts how many times a value appears, in O(log n).

## Writing binary search yourself

Libraries won't cover "binary search on the answer" problems, so you need a template you trust. This one finds the **first index where a condition becomes true**, for a condition that is false, false, ..., true, true.

```python
def first_true(lo, hi, cond):
    while lo < hi:
        mid = (lo + hi) // 2
        if cond(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo

nums = [2, 4, 4, 8, 10]
print(first_true(0, len(nums), lambda i: nums[i] >= 4))
print(first_true(0, len(nums), lambda i: nums[i] >= 9))
print(first_true(0, len(nums), lambda i: nums[i] >= 99))
print(first_true(1, 100, lambda x: x * x >= 50))
```

The search range is `[lo, hi)`, and `hi` itself is the answer when the condition is never true. The last line searches **numbers**, not indexes: the smallest x with x² ≥ 50 is 8. That's binary search on the answer.

## Compare: Sort once, or search each time?

| Situation | Approach | Cost |
|---|---|---|
| One lookup in unsorted data | Linear scan | O(n) |
| Many lookups, data doesn't change | Sort once, then `bisect` | O(n log n + q log n) |
| Many lookups by exact value | A set or dict | O(n + q) |
| Smallest value that satisfies a yes/no test that flips once | Binary search on the answer | O(log(range) × cost of the test) |

## Pitfall: An infinite loop from mid rounding

```python
def broken_last_true(lo, hi, cond, limit=20):
    steps = 0
    while lo < hi and steps < limit:
        steps += 1
        mid = (lo + hi) // 2
        if cond(mid):
            lo = mid
        else:
            hi = mid - 1
    return lo, steps

print(broken_last_true(0, 1, lambda x: x <= 1))
```

With `lo = mid` and `mid` rounding down, `lo` never moves once `hi = lo + 1`, so the loop spins until the safety limit stops it. When you set `lo = mid`, round up instead: `mid = (lo + hi + 1) // 2`. Or stick to the one template above.

## Pitfall: bisect on unsorted data

```python
from bisect import bisect_left

print(bisect_left([5, 1, 4, 2], 4))
```

bisect assumes the list is sorted and silently returns a meaningless index otherwise.

## Quiz

### `sorted(words, key=lambda w: (-len(w), w))` orders words how?
- [x] Longest first, ties alphabetical
- [ ] Shortest first, ties alphabetical
- [ ] Alphabetical, ties by length
Why: Tuples compare left to right; `-len(w)` puts larger lengths first, then `w` breaks ties A to Z.

### For `a = [1, 2, 2, 2, 5]`, what is `bisect_right(a, 2)`?
- [ ] 1
- [ ] 3
- [x] 4
Why: `bisect_right` returns the position just after the last 2.

### Binary search on the answer needs which property?
- [ ] The input array is sorted
- [x] A yes/no test that is false up to some point and true after it
- [ ] The answer is an index
Why: As long as the test flips exactly once, you can binary search over the range of possible answers.

## Exercise: search-range | First and last position
Write `search_range(nums, target)` that returns `(first, last)`, the first and last index of `target` in the sorted list `nums`, or `(-1, -1)` if it isn't there, in O(log n). Use `bisect` or your own binary search.

```python starter
from bisect import bisect_left, bisect_right


def search_range(nums, target):
    # TODO: two binary searches
    pass
```

```python checks
check("middle", lambda: search_range([5, 7, 7, 8, 8, 10], 8), (3, 4))
check("missing", lambda: search_range([5, 7, 7, 8, 8, 10], 6), (-1, -1))
check("empty", lambda: search_range([], 0), (-1, -1))
check("all the same", lambda: search_range([2, 2, 2], 2), (0, 2))
check("big", lambda: search_range(list(range(1000000)), 765432), (765432, 765432))
```

## Exercise: integer-sqrt | Square root by binary search
Write `isqrt(n)` that returns the largest integer `r` with `r * r <= n`, for any `n >= 0`, using binary search on the answer. Don't use `math.sqrt`, `math.isqrt` or `** 0.5`: floats lose precision for huge numbers.

```python starter
def isqrt(n):
    # TODO: binary search for the largest r with r * r <= n
    pass
```

```python checks
check("perfect square", lambda: isqrt(49), 7)
check("between squares", lambda: isqrt(50), 7)
check("zero and one", lambda: (isqrt(0), isqrt(1)), (0, 1))
check("huge", lambda: isqrt(10 ** 40 + 12345), 10 ** 20)
check("huge minus one", lambda: isqrt(10 ** 40 - 1), 10 ** 20 - 1)
```
