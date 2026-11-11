---
id: complexity
unit: 2
title: Big-O in Python
minutes: 30
summary: Big-O tells you how work grows with the input. LeetCode's limits (often n up to 100,000) quietly tell you which complexity will pass, and knowing what each Python operation costs lets you predict that before you code.
---

## Counting steps, not seconds

Big-O describes how the number of steps grows as the input size `n` grows, ignoring constants. Here we count comparisons directly, so the growth is easy to see.

```python
def linear_search_steps(nums, target):
    steps = 0
    for x in nums:
        steps += 1
        if x == target:
            break
    return steps

def binary_search_steps(nums, target):
    lo, hi, steps = 0, len(nums) - 1, 0
    while lo <= hi:
        steps += 1
        mid = (lo + hi) // 2
        if nums[mid] == target:
            break
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return steps

for n in [10, 1_000, 1_000_000]:
    nums = list(range(n))
    print(n, linear_search_steps(nums, n - 1), binary_search_steps(nums, n - 1))
```

Multiplying the input by 1000 multiplies linear search's work by 1000 but adds only about 10 steps to binary search. That's O(n) versus O(log n).

## The common growth rates

```python
import math

print(f"{'n':>9} {'log n':>6} {'n log n':>12} {'n^2':>16}")
for n in [10, 1_000, 100_000]:
    print(f"{n:>9} {math.log2(n):>6.0f} {n * math.log2(n):>12.0f} {n * n:>16}")
```

A computer does roughly 10⁷ to 10⁸ simple Python steps per second. With n = 100,000, O(n log n) is about 1.7 million steps (fast) while O(n²) is 10 billion (far too slow).

## Read the limits to guess the target

The input size in a problem's constraints hints at the intended complexity.

```python
hints = [
    ("n <= 12", "O(n!) or O(2^n): try every arrangement, backtracking"),
    ("n <= 25", "O(2^n): subsets, bitmasks"),
    ("n <= 500", "O(n^3): triple loops, interval DP"),
    ("n <= 5,000", "O(n^2): pairs, 2D DP"),
    ("n <= 200,000", "O(n log n) or O(n): sorting, heaps, two pointers, hashing"),
    ("n <= 10^9", "O(log n) or O(1): binary search, math"),
]
for limit, idea in hints:
    print(f"{limit:<13} -> {idea}")
```

## Hidden costs in innocent-looking Python

A line of Python is not one step. Each of these hides a loop.

```python
nums = list(range(10))
seen = set(nums)

hidden = [
    ("x in nums", "O(n): scans the list"),
    ("x in seen", "O(1) average: hashing"),
    ("nums[1:]", "O(n): copies the list"),
    ("nums.pop(0)", "O(n): shifts everything"),
    ("s1 + s2 (strings)", "O(len): builds a new string"),
    ("sorted(nums)", "O(n log n)"),
    ("min(nums), sum(nums)", "O(n) each"),
]
for code, cost in hidden:
    print(f"{code:<22} {cost}")
```

A loop that calls `x in some_list` or slices on every pass is secretly O(n²).

## Space complexity

Memory counts too. Extra lists, dicts, sets and the recursion call stack all use space. "O(1) extra space" means you only use a few variables beyond the input.

```python
def reverse_copy(nums):
    return nums[::-1]

def reverse_in_place(nums):
    i, j = 0, len(nums) - 1
    while i < j:
        nums[i], nums[j] = nums[j], nums[i]
        i, j = i + 1, j - 1
    return nums

print(reverse_copy([1, 2, 3]), reverse_in_place([1, 2, 3]))
```

The first uses O(n) extra space for the new list. The second swaps from both ends and uses O(1).

## Compare: Costs of Python operations

| Operation | list | set / dict | str |
|---|---|---|---|
| Index `a[i]` | O(1) | not applicable | O(1) |
| Membership `x in a` | O(n) | O(1) average | O(n) |
| Add at end | O(1) `append` | O(1) `add` / `d[k] = v` | O(n), builds a new string |
| Remove | O(n) `remove`, O(1) `pop()` | O(1) `discard` / `del` | O(n) |
| Copy or slice | O(k) | O(n) | O(k) |
| Sort | O(n log n) | not applicable | O(n log n) via `sorted` |

## Pitfall: Membership checks inside a loop

```python
def common_slow(a, b):
    steps = 0
    out = []
    for x in a:
        for y in b:
            steps += 1
            if x == y:
                out.append(x)
                break
    return out, steps

def common_fast(a, b):
    lookup = set(b)
    return [x for x in a if x in lookup], len(a) + len(b)

a, b = list(range(0, 2000, 2)), list(range(0, 2000, 3))
print(common_slow(a, b)[1], common_fast(a, b)[1], common_slow(a, b)[0] == common_fast(a, b)[0])
```

`x in b` on a list is a hidden inner loop. Building a set once makes each check O(1), turning O(n·m) into O(n + m).

## Quiz

### n can be up to 100,000. Which complexity is likely too slow?
- [ ] O(n)
- [ ] O(n log n)
- [x] O(n²)
Why: 100,000² is 10 billion steps, far beyond what fits in a time limit. O(n log n) is under 2 million.

### What's the cost of `if x in nums:` where `nums` is a list?
- [ ] O(1)
- [ ] O(log n)
- [x] O(n)
Why: Lists aren't hashed, so Python compares against each item in turn. Convert to a set for repeated checks.

### Doubling n makes an O(n log n) algorithm take roughly how much longer?
- [ ] The same time
- [x] A bit more than twice as long
- [ ] Four times as long
Why: 2n·log(2n) = 2n·(log n + 1), slightly more than double. O(n²) would be four times.

## Exercise: has-duplicate | Duplicates, fast
Write `has_duplicate(nums)` that returns True if any value appears twice. It must handle 200,000 numbers quickly, so no nested loops and no `in` on a list.

```python starter
def has_duplicate(nums):
    # TODO: O(n) with a set
    pass
```

```python checks
check("yes", lambda: has_duplicate([1, 2, 3, 1]), True)
check("no", lambda: has_duplicate([1, 2, 3]), False)
check("empty", lambda: has_duplicate([]), False)
check("big, no duplicates", lambda: has_duplicate(list(range(200000))), False)
check("big, duplicate at the end", lambda: has_duplicate(list(range(200000)) + [5]), True)
```

## Exercise: pair-count | Count pairs that sum to k
Write `count_pairs(nums, k)` that returns how many index pairs `i < j` have `nums[i] + nums[j] == k`. The straightforward double loop is O(n²); make it O(n) with a dict of counts of values seen so far.

```python starter
def count_pairs(nums, k):
    # TODO: for each x, how many earlier values equal k - x?
    pass
```

```python checks
check("basic", lambda: count_pairs([1, 5, 7, -1], 6), 2)
check("repeats", lambda: count_pairs([1, 1, 1, 1], 2), 6)
check("none", lambda: count_pairs([1, 2, 3], 100), 0)
check("empty", lambda: count_pairs([], 0), 0)
check("big input", lambda: count_pairs([1] * 100000, 2), 100000 * 99999 // 2)
```
