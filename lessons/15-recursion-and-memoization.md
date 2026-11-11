---
id: recursion-and-memoization
unit: 2
title: Recursion and memoization
minutes: 35
summary: Recursion solves a problem by solving smaller copies of it. Add a cache and the same idea becomes dynamic programming, the technique behind a large share of hard LeetCode problems.
---

## Base case plus a smaller step

Every recursive function needs a **base case** that answers directly, and a **recursive case** that moves toward it. Trust that the smaller call works, and focus on combining its answer.

```python
def total(nums):
    if not nums:
        return 0
    return nums[0] + total(nums[1:])

def power(x, n):
    if n == 0:
        return 1
    half = power(x, n // 2)
    return half * half * (x if n % 2 else 1)

print(total([1, 2, 3, 4]))
print(power(2, 30), power(3, 5))
```

`power` halves `n` each call, so it takes O(log n) calls instead of n.

## Watching the call stack

Each call waits for the calls it makes. Printing with indentation shows the calls going down and the answers coming back up.

```python
def fact(n, depth=0):
    print("  " * depth + f"fact({n})")
    if n <= 1:
        result = 1
    else:
        result = n * fact(n - 1, depth + 1)
    print("  " * depth + f"-> {result}")
    return result

fact(3)
```

Python allows about 1000 nested calls by default. Deeper recursion raises RecursionError, so very deep inputs (like a linked list of 100,000 nodes) need a loop or an explicit stack.

## Overlapping subproblems

Naive recursive Fibonacci recomputes the same values again and again. Counting the calls shows the explosion.

```python
calls = 0

def fib(n):
    global calls
    calls += 1
    return n if n < 2 else fib(n - 1) + fib(n - 2)

for n in [10, 20, 25]:
    calls = 0
    fib(n)
    print(n, calls)
```

The number of calls grows exponentially, about 1.6 times per step of n.

## Memoization: remember answers

Store each answer the first time you compute it. `functools.cache` does it for you: same arguments, same answer, computed once. Now every n is computed exactly once: O(n).

```python
from functools import cache

@cache
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print(fib(90))

@cache
def ways(n):
    """Ways to climb n stairs taking 1 or 2 steps at a time."""
    if n <= 1:
        return 1
    return ways(n - 1) + ways(n - 2)

print([ways(n) for n in range(1, 8)])
```

Arguments must be hashable to be cached, so pass tuples, not lists.

## From memoization to a table

The same recurrence can fill a table bottom-up: answer the small cases first, then build up. This avoids recursion depth limits and is the classic form of dynamic programming.

```python
def ways_table(n):
    dp = [0] * (n + 1)
    dp[0] = 1
    for i in range(1, n + 1):
        dp[i] = dp[i - 1] + (dp[i - 2] if i >= 2 else 0)
    return dp[n]

def ways_two_vars(n):
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b

print(ways_table(30), ways_two_vars(30))
```

When each step only looks back a fixed distance, you can keep just those few values: O(1) memory.

## Compare: Three ways to compute the same recurrence

| | Plain recursion | Memoized (`@cache`) | Bottom-up table |
|---|---|---|---|
| Code | Shortest | Recursion plus one decorator | A loop over the subproblems |
| Time when subproblems overlap | Exponential | Each subproblem once | Each subproblem once |
| Depth limit | Yes | Yes | No |
| Best when | Subproblems don't repeat (trees, divide and conquer) | Hard-to-order subproblems | Order is clear; you want speed or less memory |

## Pitfall: No base case

```python
import sys
sys.setrecursionlimit(100)

def countdown(n):
    return countdown(n - 1)

try:
    countdown(5)
except RecursionError as e:
    print("RecursionError:", e)
```

Without a base case the calls never stop. Always write the base case first.

## Pitfall: Caching a function that takes a list

```python
from functools import cache

@cache
def best(nums):
    return max(nums)

try:
    best([3, 1, 2])
except TypeError as e:
    print("TypeError:", e)
print(best((3, 1, 2)))
```

The cache uses arguments as dict keys, so they must be hashable. Pass a tuple, or better, pass an index into a list that the function reads from the enclosing scope.

## Quiz

### What makes naive recursive Fibonacci slow?
- [ ] Recursion is always slow in Python
- [x] It recomputes the same subproblems many times
- [ ] The numbers get too big
Why: fib(n - 2) is computed inside fib(n - 1) and again directly. With a cache each value is computed once.

### Why might a correct recursive solution fail on a list of 100,000 items?
- [ ] Lists can't be passed recursively
- [x] It exceeds Python's recursion depth limit of about 1000
- [ ] Recursion can't return lists
Why: Each call adds a stack frame. Use a loop, an explicit stack, or bottom-up DP for deep inputs.

### What must be true of arguments to a `@cache` function?
- [x] They must be hashable
- [ ] They must be integers
- [ ] There must be only one
Why: The cache stores results in a dict keyed by the arguments.

## Exercise: grid-paths | Paths through a grid
A robot starts at the top-left of an `rows x cols` grid and can only move right or down. Some cells are blocked: `blocked` is a set of `(r, c)` tuples. Write `count_paths(rows, cols, blocked)` that returns the number of paths to the bottom-right corner. Use recursion with `@cache` (or a table).

```python starter
from functools import cache


def count_paths(rows, cols, blocked):
    # TODO: paths(r, c) = paths from (r, c) to the end
    pass
```

```python checks
check("2x2", lambda: count_paths(2, 2, set()), 2)
check("3x3", lambda: count_paths(3, 3, set()), 6)
check("blocked middle", lambda: count_paths(3, 3, {(1, 1)}), 2)
check("start blocked", lambda: count_paths(2, 2, {(0, 0)}), 0)
check("big grid", lambda: count_paths(17, 17, set()), 601080390)
```

## Exercise: fewest-coins | Fewest coins
Write `fewest_coins(coins, amount)` that returns the smallest number of coins (unlimited of each denomination) that add up to `amount`, or -1 if it can't be done. Greedy fails here (try coins `[1, 3, 4]` and amount 6), so think in subproblems: the best for `amount` uses the best for `amount - coin`.

```python starter
def fewest_coins(coins, amount):
    # TODO: best[a] for every a from 0 up to amount
    pass
```

```python checks
check("greedy fails", lambda: fewest_coins([1, 3, 4], 6), 2)
check("basic", lambda: fewest_coins([1, 2, 5], 11), 3)
check("impossible", lambda: fewest_coins([2], 3), -1)
check("zero", lambda: fewest_coins([1], 0), 0)
check("large amount", lambda: fewest_coins([186, 419, 83, 408], 6249), 20)
```
