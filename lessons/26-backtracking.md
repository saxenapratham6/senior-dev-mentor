---
id: backtracking
unit: 3
title: Backtracking
minutes: 40
summary: Backtracking builds answers one choice at a time, choose, explore, then undo the choice. It generates subsets, permutations and combinations, and solves puzzles by abandoning a path the moment it can't work.
---

## Signals
- "All" or "every": all subsets, permutations, combinations, partitions
- Small input sizes (n up to about 15 to 20)
- Puzzles with constraints: N-Queens, Sudoku, word search in a grid
- "Return every valid arrangement", not just how many

## The template: choose, explore, unchoose

Keep the current partial answer in a list. At each step, try each option: add it, recurse, then remove it so the next option starts from the same state.

```python
def all_subsets(nums):
    result, path = [], []

    def explore(start):
        result.append(path[:])
        for i in range(start, len(nums)):
            path.append(nums[i])
            explore(i + 1)
            path.pop()

    explore(0)
    return result

print(all_subsets([1, 2, 3]))
```

`path[:]` saves a **copy**: `path` itself keeps changing as the search continues.

## Seeing the decision tree

Printing each step with indentation shows how the search walks down a choice, back up, and down the next one.

```python
def permutations(items):
    out, path, used = [], [], [False] * len(items)

    def explore(depth):
        if len(path) == len(items):
            out.append("".join(path))
            return
        for i, ch in enumerate(items):
            if used[i]:
                continue
            print("  " * depth + f"choose {ch}")
            used[i] = True
            path.append(ch)
            explore(depth + 1)
            path.pop()
            used[i] = False

    explore(0)
    return out

print(permutations("abc"))
```

## Worked example: pruning dead ends

Pruning means stopping early when a partial answer can't lead to a valid one. Here: binary strings of length n with no two consecutive 1s. Never place a `1` right after a `1`.

```python
def no_adjacent_ones(n):
    out, path = [], []

    def explore():
        if len(path) == n:
            out.append("".join(path))
            return
        path.append("0")
        explore()
        path.pop()
        if not path or path[-1] != "1":
            path.append("1")
            explore()
            path.pop()

    explore()
    return out

print(no_adjacent_ones(3))
print(len(no_adjacent_ones(10)), "of", 2 ** 10)
```

Without pruning you'd generate all 1024 strings and filter. With it, the search never walks into the 880 invalid ones.

## Compare: Subsets, combinations, permutations

| Generate | Loop starts at | Track | Count for n items |
|---|---|---|---|
| Subsets | `i` from `start` (no going back) | `path` | 2ⁿ |
| Combinations of size k | `i` from `start`; stop at length k | `path` | n choose k |
| Permutations | Every `i` not yet used | `path` and `used` | n! |
| With duplicates in the input | Sort first, skip `nums[i] == nums[i-1]` at the same level | Same as above | Fewer |

## Pitfall: Saving the path without copying it

```python
def subsets_bug(nums):
    result, path = [], []

    def explore(start):
        result.append(path)
        for i in range(start, len(nums)):
            path.append(nums[i])
            explore(i + 1)
            path.pop()

    explore(0)
    return result

print(subsets_bug([1, 2]))
```

Every saved entry is the **same** list object, which is empty by the end. Append `path[:]` or `list(path)`.

## Pitfall: Forgetting to undo the choice

```python
def subsets_no_undo(nums):
    result, path = [], []

    def explore(start):
        result.append(path[:])
        for i in range(start, len(nums)):
            path.append(nums[i])
            explore(i + 1)

    explore(0)
    return result

print(subsets_no_undo([1, 2, 3]))
```

Without `path.pop()`, choices pile up across branches and the "subsets" are wrong. Every `append` before the recursive call needs a matching `pop` after it.

## Quiz

### Why append `path[:]` instead of `path` to the results?
- [x] `path` keeps changing; a copy freezes its current contents
- [ ] Slicing is faster
- [ ] Lists can't contain lists
Why: Appending `path` stores a reference to one list that the search keeps modifying.

### What makes backtracking faster than generating everything and filtering?
- [ ] It uses a cache
- [x] Pruning stops exploring a branch as soon as it can't succeed
- [ ] It runs in parallel
Why: A pruned branch skips its whole subtree of partial answers.

## Exercise: combination-sum-unique | Combinations that hit a target
Write `combos(candidates, target)` that returns every unique combination of numbers from `candidates` (each position used **at most once**) that adds up to `target`. `candidates` may contain duplicates; don't return the same combination twice. Return each combination sorted, and the list of combinations sorted. Sort first, skip equal values at the same level, and stop a branch once the sum exceeds the target.

```python starter
def combos(candidates, target):
    # TODO: sort, backtrack with a start index, skip duplicates at the same level, prune
    pass
```

```python checks
check("example", lambda: combos([10, 1, 2, 7, 6, 1, 5], 8), [[1, 1, 6], [1, 2, 5], [1, 7], [2, 6]])
check("repeats", lambda: combos([2, 5, 2, 1, 2], 5), [[1, 2, 2], [5]])
check("none", lambda: combos([3, 4], 2), [])
check("many duplicates", lambda: combos([1] * 30, 3), [[1, 1, 1]])
```

## Ladder
- medium: Subsets
- medium: Permutations
- medium: Combination Sum
- medium: Word Search
- medium: Palindrome Partitioning
- medium: Letter Combinations of a Phone Number
- hard: N-Queens
- hard: Sudoku Solver
