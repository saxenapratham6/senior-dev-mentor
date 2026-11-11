---
id: lists
unit: 1
title: Lists
minutes: 30
summary: Lists are Python's workhorse. Knowing which list operations are cheap and which quietly cost O(n) is the difference between a solution that passes and one that times out.
---

## A list is a growable array

A list stores references to objects in a contiguous array. Appending and popping at the **end** are O(1). Anything that shifts elements, like inserting or popping at the **front**, is O(n).

```python
nums = [5, 3, 8]
nums.append(1)
last = nums.pop()
nums.insert(0, 9)
first = nums.pop(0)
print(nums, last, first)
print(len(nums), nums[-1], 8 in nums)
```

`x in nums` scans the whole list, which is O(n). If you check membership many times, use a set instead (lesson 5).

## Slices make new lists

`nums[a:b]` builds a new list, which costs O(b - a). That's handy for copies (`nums[:]`) but adds up if you slice inside a loop. Assigning to a slice replaces that part of the list in place.

```python
nums = [0, 1, 2, 3, 4, 5]
evens = nums[::2]
nums[1:3] = ["a", "b", "c"]
print(evens)
print(nums)
print(nums[::-1])
```

## sort versus sorted

`list.sort()` sorts in place and returns `None`. `sorted(anything)` returns a new list and works on any iterable. Both accept `key=` and `reverse=True`, and both are stable: equal items keep their original order.

```python
words = ["pear", "fig", "banana", "kiwi"]
print(sorted(words, key=len))
words.sort(key=lambda w: (-len(w), w))
print(words)
print(sorted([3, 1, 2], reverse=True))
```

Sorting by a tuple key like `(-len(w), w)` means "longest first, then alphabetical". Python compares tuples element by element.

## Lists as stacks

A list is a perfect stack: `append` pushes and `pop` pops from the same end, both O(1). Don't use a list as a queue (`pop(0)` is O(n)); use `collections.deque` instead (lesson 12).

```python
stack = []
for ch in "([])":
    if ch in "([":
        stack.append(ch)
    else:
        print("matching", stack.pop(), ch)
print("empty at the end:", not stack)
```

`not stack` is the Pythonic way to ask "is this empty?"

## Building 2D grids

Use a list comprehension so every row is its own list. You'll make grids constantly for matrix and dynamic programming problems.

```python
rows, cols = 3, 4
grid = [[0] * cols for _ in range(rows)]
grid[0][0] = 1
print(grid)
print([row[1] for row in grid])
```

## Compare: Common list operations and their cost

| Operation | Cost | Notes |
|---|---|---|
| `a[i]`, `a[i] = x`, `len(a)` | O(1) | Arrays index directly |
| `a.append(x)`, `a.pop()` | O(1) | Work at the end |
| `a.insert(0, x)`, `a.pop(0)` | O(n) | Everything shifts |
| `x in a`, `a.index(x)`, `a.count(x)` | O(n) | Scans the list |
| `a[i:j]` | O(j - i) | Builds a new list |
| `a.sort()`, `sorted(a)` | O(n log n) | Stable |

## Pitfall: The repeated-row grid

```python
grid = [[0] * 3] * 3
grid[0][0] = 1
print(grid)
```

`[row] * 3` repeats the *reference* three times, so all three "rows" are the same list (remember: names are tags). Build grids with `[[0] * 3 for _ in range(3)]`.

## Pitfall: Removing items while looping

```python
nums = [2, 4, 6, 7]
for n in nums:
    if n % 2 == 0:
        nums.remove(n)
print(nums)
```

Removing shifts the remaining items, so the loop skips the one right after each removal. Build a new list instead: `[n for n in nums if n % 2 != 0]`.

## Pitfall: Using the result of sort()

```python
nums = [3, 1, 2]
result = nums.sort()
print(result, nums)
```

`sort()` changes the list and returns `None`. Use `sorted(nums)` when you need a new list.

## Quiz

### Which is O(n) on a list of n items?
- [ ] `a.append(x)`
- [ ] `a[-1]`
- [x] `a.pop(0)`
- [ ] `a.pop()`
Why: Popping the first item shifts every other item one place to the left.

### What does `[[0] * 2] * 2` create?
- [ ] Two independent rows
- [x] Two references to the same row
- [ ] A 1D list of four zeros
Why: Multiplying a list repeats references. Changing one "row" changes both. Use a comprehension for grids.

### What does `sorted(["bb", "a", "ccc"], key=len, reverse=True)` return?
- [x] `["ccc", "bb", "a"]`
- [ ] `["a", "bb", "ccc"]`
- [ ] `["ccc", "a", "bb"]`
Why: `key=len` sorts by length and `reverse=True` puts the longest first.

## Exercise: rotate-list | Rotate to the right
Write `rotate(nums, k)` that returns a **new** list with the items rotated right by `k` steps: `rotate([1, 2, 3, 4, 5], 2)` → `[4, 5, 1, 2, 3]`. `k` may be larger than the list, and the list may be empty. Don't change `nums`.

```python starter
def rotate(nums, k):
    # TODO: think about what k larger than len(nums) means, then use slices
    pass
```

```python checks
check("basic", lambda: rotate([1, 2, 3, 4, 5], 2), [4, 5, 1, 2, 3])
check("k bigger than length", lambda: rotate([1, 2, 3], 4), [3, 1, 2])
check("empty", lambda: rotate([], 3), [])
check("k is zero", lambda: rotate([1, 2], 0), [1, 2])
data = [1, 2, 3]
rotate(data, 1)
check("original untouched", lambda: data, [1, 2, 3])
```

## Exercise: spiral | Spiral order
Write `spiral(matrix)` that returns the numbers of a rectangular grid in clockwise spiral order, starting at the top-left. Track four boundaries (top, bottom, left, right) and shrink them as you go.

```python starter
def spiral(matrix):
    # TODO: walk right, down, left, up while shrinking the boundaries
    pass
```

```python checks
check("3x3", lambda: spiral([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), [1, 2, 3, 6, 9, 8, 7, 4, 5])
check("3x4", lambda: spiral([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]), [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7])
check("one row", lambda: spiral([[1, 2, 3]]), [1, 2, 3])
check("one column", lambda: spiral([[1], [2], [3]]), [1, 2, 3])
check("empty", lambda: spiral([]), [])
```
