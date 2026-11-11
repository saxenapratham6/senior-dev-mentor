---
id: two-pointers
unit: 3
title: Two pointers
minutes: 35
summary: Two indexes walking through data, from both ends toward the middle or one chasing the other, replace a nested loop with a single pass. O(n²) becomes O(n).
---

## Signals
- The input is sorted, or sorting it wouldn't hurt
- You're looking for a pair (or triple) that meets a condition
- Palindromes, or comparing a sequence with its reverse
- "In place" or "O(1) extra space" over an array
- Merging, or removing items while keeping order

## The idea

A nested loop tries every pair: O(n²). With sorted data you can do better. Put one pointer at each end. If the pair's sum is too small, the only way to grow it is to move the **left** pointer right; too big, move the **right** pointer left. Each step rules out a whole row of pairs, so one pass is enough.

```python
def pair_with_sum(nums, target):
    i, j = 0, len(nums) - 1
    while i < j:
        s = nums[i] + nums[j]
        print(f"i={i} j={j} sum={s}")
        if s == target:
            return nums[i], nums[j]
        if s < target:
            i += 1
        else:
            j -= 1
    return None

print(pair_with_sum([1, 3, 4, 6, 8, 11], 10))
```

## Worked example: squares of a sorted array

Given a sorted array that may contain negatives, return the squares in sorted order in O(n). The largest square is always at one of the **ends** (a big negative or a big positive), so compare the two ends and fill the result from the back.

```python
def sorted_squares(nums):
    out = [0] * len(nums)
    i, j = 0, len(nums) - 1
    for k in range(len(nums) - 1, -1, -1):
        if abs(nums[i]) > abs(nums[j]):
            out[k] = nums[i] ** 2
            i += 1
        else:
            out[k] = nums[j] ** 2
            j -= 1
    return out

print(sorted_squares([-7, -3, 2, 3, 11]))
```

## Fast and slow pointers in one array

The other two-pointer shape: a **slow** pointer marks where the next kept item goes, while a **fast** pointer reads every item. This removes items in place, in one pass, keeping order.

```python
def remove_value(nums, val):
    slow = 0
    for fast in range(len(nums)):
        if nums[fast] != val:
            nums[slow] = nums[fast]
            slow += 1
    return slow, nums[:slow]

print(remove_value([3, 2, 2, 3, 4, 3], 3))
```

## Compare: Nested loops or two pointers?

| | Nested loops | Two pointers |
|---|---|---|
| Time | O(n²) | O(n), plus O(n log n) if you must sort first |
| Needs | Nothing | Sorted data, or a "keep / skip" decision per item |
| Finds | Every pair | Pairs where moving one end clearly helps |
| Typical use | Small n, or unsorted pair counting | Pair sums, palindromes, in-place removal, merging |

## Pitfall: Moving the wrong pointer

```python
def wrong(nums, target):
    i, j = 0, len(nums) - 1
    while i < j:
        s = nums[i] + nums[j]
        if s == target:
            return True
        if s < target:
            j -= 1
        else:
            i += 1
    return False

print(wrong([1, 2, 3, 9], 5), "but 2 + 3 == 5")
```

When the sum is too small, moving `j` left only makes it smaller. Always ask: which move can possibly fix the sum?

## Quiz

### Why does the two-pointer pair search need the array to be sorted?
- [ ] So the pointers don't cross
- [x] So moving a pointer changes the sum in a predictable direction
- [ ] Because Python requires it
Why: In a sorted array, moving left up can only increase the sum and moving right down can only decrease it, which lets you discard pairs safely.

### What does the slow pointer represent in "remove in place"?
- [x] The position where the next kept item should be written
- [ ] The item being examined
- [ ] The number of removed items
Why: Everything before `slow` is the kept, compacted result.

## Exercise: three-sum-zero-count | Triplets that sum to a target
Write `count_triplets(nums, target)` that returns the number of **distinct value triplets** `(a, b, c)` with `a <= b <= c`, taken from different positions, that add up to `target`. Sort first, fix the smallest value, then use two pointers for the other two. Skip duplicates so each triplet counts once. Aim for O(n²).

```python starter
def count_triplets(nums, target):
    # TODO: sort, loop over the first value, two pointers for the rest
    pass
```

```python checks
check("classic", lambda: count_triplets([-1, 0, 1, 2, -1, -4], 0), 2)
check("all zeros", lambda: count_triplets([0, 0, 0, 0], 0), 1)
check("none", lambda: count_triplets([1, 2, 3], 100), 0)
check("other target", lambda: count_triplets([1, 1, 2, 2, 3, 3], 6), 1)
check("bigger input", lambda: count_triplets(list(range(-300, 301)), 0), 45000)
```

## Ladder
- easy: Valid Palindrome
- easy: Merge Sorted Array
- medium: Two Sum II - Input Array Is Sorted
- medium: 3Sum
- medium: Container With Most Water
- medium: Sort Colors
- hard: Trapping Rain Water
