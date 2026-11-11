---
id: idioms
unit: 2
title: Idioms that make solutions short
minutes: 25
summary: A handful of tools, prefix sums, itertools, zip(*grid), divmod and infinity sentinels, show up again and again in fast, readable solutions.
---

## Prefix sums answer range questions in O(1)

`prefix[i]` holds the sum of the first `i` items, so the sum of `nums[i:j]` is `prefix[j] - prefix[i]`. One O(n) pass turns every later range-sum question into a subtraction. `itertools.accumulate` builds it.

```python
from itertools import accumulate

nums = [3, 1, 4, 1, 5, 9, 2]
prefix = [0, *accumulate(nums)]
print(prefix)
print(sum(nums[2:5]), prefix[5] - prefix[2])
print(list(accumulate(nums, max)))
```

`accumulate` also takes a function: with `max` it gives the running maximum.

## Combinations, permutations and products

`itertools` generates arrangements lazily. Good for brute-forcing small inputs, and for checking your clever solution against a brute-force one.

```python
from itertools import combinations, permutations, product

print(list(combinations("abc", 2)))
print(len(list(permutations(range(4)))))
print(list(product([0, 1], repeat=2)))
print([c for c in combinations([1, 2, 3, 4], 2) if sum(c) == 5])
```

## Grid tricks: zip(*grid) and directions

`zip(*grid)` turns rows into columns. A list of direction offsets keeps neighbor code short and bug-free.

```python
grid = [[1, 2, 3],
        [4, 5, 6]]
columns = [list(col) for col in zip(*grid)]
print(columns)
rotated = [list(row) for row in zip(*grid[::-1])]
print(rotated)

DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]
r, c = 0, 1
neighbors = [(r + dr, c + dc) for dr, dc in DIRS
             if 0 <= r + dr < len(grid) and 0 <= c + dc < len(grid[0])]
print(neighbors)
```

`zip(*grid[::-1])` rotates a grid 90° clockwise.

## divmod, infinity and other small helpers

```python
minutes, seconds = divmod(135, 60)
print(minutes, seconds)

best = float("inf")
for x in [7, 3, 9]:
    best = min(best, x)
print(best, float("-inf") < -10 ** 18)

print(max([], default=0), sum([], start=10))
print(list(map(int, "1 2 3".split())))
print(abs(-5), pow(2, 10, 1000), 10 ** 9 + 7)
```

`float("inf")` is a safe starting value for a minimum. `pow(a, b, m)` computes `a ** b % m` quickly, and many problems ask for answers modulo `10 ** 9 + 7`.

## groupby for runs

`itertools.groupby` groups **consecutive** equal items. It's perfect for runs in a string; sort first if you want all equal items together.

```python
from itertools import groupby

s = "aaabccdddd"
print([(ch, len(list(run))) for ch, run in groupby(s)])
print(max(len(list(run)) for _, run in groupby(s)))
```

## Compare: Hand-written loop or idiom?

| Task | Hand-written | Idiom |
|---|---|---|
| Range sums | Inner loop per query: O(n) each | Prefix sums: O(1) each |
| Transpose a grid | Two nested loops | `list(zip(*grid))` |
| All pairs | Two index loops | `combinations(items, 2)` |
| Runs of equal items | Index juggling | `groupby(s)` |
| Minimum so far | `best = None` and special cases | `best = float("inf")` |

## Pitfall: groupby without sorting

```python
from itertools import groupby

words = ["apple", "bob", "avocado", "banana"]
print([(k, list(g)) for k, g in groupby(words, key=lambda w: w[0])])
words.sort()
print([(k, list(g)) for k, g in groupby(words, key=lambda w: w[0])])
```

groupby only groups items that are next to each other. Sort by the same key first to collect all of them.

## Pitfall: Forgetting the leading 0 in prefix sums

```python
from itertools import accumulate

nums = [2, 3, 5]
prefix = list(accumulate(nums))
print(prefix[2] - prefix[0])
prefix = [0, *accumulate(nums)]
print(prefix[3] - prefix[0])
```

Without the leading 0, the sum of the whole list (or any range starting at 0) needs a special case. With it, `sum(nums[i:j]) == prefix[j] - prefix[i]` always.

## Quiz

### With `prefix = [0, *accumulate(nums)]`, what is `sum(nums[i:j])`?
- [ ] `prefix[j] - prefix[i - 1]`
- [x] `prefix[j] - prefix[i]`
- [ ] `prefix[j + 1] - prefix[i]`
Why: `prefix[k]` is the sum of the first k items, so subtracting the first i from the first j leaves items i through j - 1.

### What does `list(zip(*[[1, 2], [3, 4]]))` give?
- [x] `[(1, 3), (2, 4)]`
- [ ] `[(1, 2), (3, 4)]`
- [ ] `[1, 2, 3, 4]`
Why: Unpacking the rows into zip pairs up the first items, then the second items: the columns.

### `groupby("aabaa")` produces how many groups?
- [ ] 2
- [x] 3
- [ ] 5
Why: It groups consecutive runs only: "aa", "b", "aa".

## Exercise: range-sums | Range sum queries
Write `range_sums(nums, queries)` where each query is `(i, j)` and asks for `sum(nums[i:j])`. Return the list of answers. There can be 100,000 queries over 100,000 numbers, so build prefix sums once.

```python starter
from itertools import accumulate


def range_sums(nums, queries):
    # TODO: prefix sums with a leading 0
    pass
```

```python checks
check("basic", lambda: range_sums([1, 2, 3, 4], [(0, 2), (1, 4), (2, 2)]), [3, 9, 0])
check("whole list", lambda: range_sums([5, -2, 7], [(0, 3)]), [10])
big = list(range(100000))
check("many queries", lambda: range_sums(big, [(i, i + 100) for i in range(0, 99900)])[-1], sum(range(99899, 99999)))
```

## Exercise: rotate-grid | Rotate and transpose
Write `rotate_clockwise(grid)` that returns the grid rotated 90° clockwise as a list of lists, and `columns_sums(grid)` that returns the sum of each column. Both work on rectangular grids. Try `zip(*...)`.

```python starter
def rotate_clockwise(grid):
    # TODO
    pass


def columns_sums(grid):
    # TODO
    pass
```

```python checks
check("rotate square", lambda: rotate_clockwise([[1, 2], [3, 4]]), [[3, 1], [4, 2]])
check("rotate rectangle", lambda: rotate_clockwise([[1, 2, 3], [4, 5, 6]]), [[4, 1], [5, 2], [6, 3]])
check("column sums", lambda: columns_sums([[1, 2, 3], [4, 5, 6]]), [5, 7, 9])
check("one row", lambda: columns_sums([[7, 8]]), [7, 8])
```
