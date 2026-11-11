---
id: dynamic-programming
unit: 3
title: Dynamic programming
minutes: 50
summary: Dynamic programming is recursion with memory, organized. Define what a subproblem means in words, write how it's built from smaller ones, then fill a table. That recipe cracks most "count the ways" and "best total" problems, including many hards.
---

## Signals
- "Number of ways", "minimum cost", "maximum total", "longest / shortest" with choices
- Each decision affects what's possible later (take it or skip it)
- A brute-force recursion would revisit the same states
- Two strings compared character by character (edit distance, common subsequence)
- A grid walked right/down, or items chosen under a capacity

## The recipe

1. **State**: say in words what `dp[i]` (or `dp[i][j]`) means.
2. **Transition**: how is `dp[i]` built from smaller states?
3. **Base cases**: the smallest states you know directly.
4. **Order**: fill states so that everything a state needs is ready.
5. **Answer**: which state holds the final answer?

Here it is for "ways to climb n stairs with steps of 1, 3 or 5": `dp[i]` = ways to reach step i; `dp[i] = dp[i-1] + dp[i-3] + dp[i-5]`; `dp[0] = 1`.

```python
def ways(n, steps=(1, 3, 5)):
    dp = [0] * (n + 1)
    dp[0] = 1
    for i in range(1, n + 1):
        dp[i] = sum(dp[i - s] for s in steps if s <= i)
    return dp

print(ways(8))
print(ways(40)[-1])
```

## 2D DP on a grid

`dp[r][c]` = the cheapest cost to reach cell `(r, c)` moving only right or down. Each cell comes from above or from the left.

```python
def min_path_cost(grid):
    rows, cols = len(grid), len(grid[0])
    dp = [[0] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            if r == 0 and c == 0:
                dp[r][c] = grid[0][0]
                continue
            up = dp[r - 1][c] if r > 0 else float("inf")
            left = dp[r][c - 1] if c > 0 else float("inf")
            dp[r][c] = grid[r][c] + min(up, left)
    for row in dp:
        print(row)
    return dp[-1][-1]

print(min_path_cost([[1, 3, 1], [1, 5, 1], [4, 2, 1]]))
```

## Take it or skip it: 0/1 knapsack

Each item is taken at most once. `dp[c]` = the best value with capacity `c` using the items so far. Loop capacities **downwards** so each item is counted only once.

```python
def knapsack(items, capacity):
    dp = [0] * (capacity + 1)
    for weight, value in items:
        for c in range(capacity, weight - 1, -1):
            dp[c] = max(dp[c], dp[c - weight] + value)
    return dp[capacity]

print(knapsack([(1, 1), (3, 4), (4, 5), (5, 7)], 7))
```

Looping capacities upwards would let one item be reused, which is the "unlimited items" version (like fewest coins in lesson 15).

## Two strings: the longest common subsequence

`dp[i][j]` = the LCS length of the first `i` characters of `a` and the first `j` of `b`. If the last characters match, extend the diagonal; otherwise drop one character from either string.

```python
def lcs(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[-1][-1]

print(lcs("abcde", "ace"), lcs("abc", "def"))
```

Using `len + 1` rows and columns gives a row and column of zeros for empty prefixes, which removes edge cases.

## Compare: Common DP shapes

| Shape | State | Typical problems |
|---|---|---|
| 1D linear | `dp[i]` uses a few earlier entries | Climbing stairs, house robber, decode ways |
| Unbounded choices | `dp[amount]` over every item | Fewest coins, coin change ways |
| 0/1 choices | `dp[capacity]`, capacities looped down | Knapsack, partition equal subset sum |
| Grid | `dp[r][c]` from up/left | Unique paths, minimum path sum |
| Two sequences | `dp[i][j]` over prefixes | LCS, edit distance, regex matching |
| Intervals | `dp[i][j]` over a range, by length | Burst balloons, palindrome partitioning |

## Pitfall: Looping capacities upward in 0/1 knapsack

```python
def knapsack_wrong(items, capacity):
    dp = [0] * (capacity + 1)
    for weight, value in items:
        for c in range(weight, capacity + 1):
            dp[c] = max(dp[c], dp[c - weight] + value)
    return dp[capacity]

print(knapsack_wrong([(2, 3)], 6), "but there is only one item worth 3")
```

Going upward, `dp[c - weight]` may already include this item, so it gets used again. For "each item once", loop capacities from high to low.

## Pitfall: Off-by-one between the table and the strings

```python
a, b = "ab", "ab"
dp = [[0] * len(b) for _ in range(len(a))]
try:
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            dp[i][j] = dp[i - 1][j - 1] + (a[i - 1] == b[j - 1])
except IndexError as e:
    print("IndexError:", e)
```

When `dp[i]` means "the first i characters", the table needs `len + 1` rows and columns, and the characters are `a[i - 1]` and `b[j - 1]`. Mixing the two conventions is the most common DP bug.

## Quiz

### What's the first thing to write down for a DP problem?
- [ ] The loops
- [x] What `dp[i]` means, in words
- [ ] The base cases
Why: Once the state is defined precisely, the transition and base cases usually follow.

### In 0/1 knapsack with a 1D table, why loop capacities from high to low?
- [x] So each item can't be used twice
- [ ] It's faster
- [ ] So the answer ends at index 0
Why: Going down, `dp[c - weight]` still holds the value from before this item was considered.

## Exercise: house-robber-circle | Houses in a circle
Houses are arranged in a circle, so the first and last are neighbors. You can't rob two neighboring houses. Write `max_loot(values)` that returns the most you can rob. First solve the straight-line version with DP (`best[i]` = the most from the first i houses), then handle the circle by solving two lines: without the first house, and without the last.

```python starter
def max_loot(values):
    # TODO: helper for a line of houses; combine two lines for the circle
    pass
```

```python checks
check("circle example", lambda: max_loot([2, 3, 2]), 3)
check("four houses", lambda: max_loot([1, 2, 3, 1]), 4)
check("one house", lambda: max_loot([5]), 5)
check("empty", lambda: max_loot([]), 0)
check("bigger", lambda: max_loot([200, 3, 140, 20, 10]), 340)
check("long street", lambda: max_loot([1, 100] * 5000), 500000)
```

## Ladder
- easy: Climbing Stairs
- easy: Min Cost Climbing Stairs
- medium: House Robber
- medium: Coin Change
- medium: Longest Increasing Subsequence
- medium: Longest Common Subsequence
- medium: Partition Equal Subset Sum
- medium: Edit Distance
- hard: Burst Balloons
- hard: Regular Expression Matching
