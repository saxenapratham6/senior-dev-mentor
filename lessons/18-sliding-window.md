---
id: sliding-window
unit: 3
title: Sliding window
minutes: 35
summary: For problems about contiguous subarrays or substrings, keep a window with two edges. Grow the right edge, shrink the left edge when the window breaks a rule, and update the answer as you go. Every item enters and leaves once, so it's O(n).
---

## Signals
- "Subarray" or "substring" (contiguous), not "subsequence"
- Longest, shortest, or count of windows that satisfy a condition
- A fixed window size k, like "every block of k days"
- At most k distinct things, no repeats, a sum at most S

## Fixed-size window

When the window size is fixed, slide it one step at a time: add the item entering on the right and subtract the one leaving on the left, instead of re-summing.

```python
def max_window_sum(nums, k):
    window = sum(nums[:k])
    best = window
    for i in range(k, len(nums)):
        window += nums[i] - nums[i - k]
        best = max(best, window)
    return best

print(max_window_sum([2, 1, 5, 1, 3, 2], 3))
```

## Variable-size window: the template

Expand `right` one step at a time. While the window is invalid, shrink from `left`. After shrinking, the window is valid, so update the answer.

```python
from collections import defaultdict

def longest_with_k_distinct(s, k):
    counts = defaultdict(int)
    left = best = 0
    for right, ch in enumerate(s):
        counts[ch] += 1
        while len(counts) > k:
            counts[s[left]] -= 1
            if counts[s[left]] == 0:
                del counts[s[left]]
            left += 1
        best = max(best, right - left + 1)
    return best

print(longest_with_k_distinct("eceba", 2))
print(longest_with_k_distinct("aabbcc", 1))
```

The window `s[left:right + 1]` always has at most k distinct characters after the `while` loop.

## Watching the window move

Printing the window at each step makes the mechanics visible: the right edge always advances, and the left edge only catches up when the rule breaks.

```python
def shortest_sum_at_least(nums, target):
    left = total = 0
    best = float("inf")
    for right, x in enumerate(nums):
        total += x
        while total >= target:
            best = min(best, right - left + 1)
            print("valid window", nums[left:right + 1])
            total -= nums[left]
            left += 1
    return 0 if best == float("inf") else best

print(shortest_sum_at_least([2, 3, 1, 2, 4, 3], 7))
```

For "shortest" problems you update the answer **inside** the shrinking loop, while the window is still valid. For "longest" you update after shrinking.

## Compare: Longest versus shortest windows

| | Longest valid window | Shortest valid window |
|---|---|---|
| Shrink while | The window is **invalid** | The window is **still valid** |
| Update the answer | After the shrink loop | Inside the shrink loop, before shrinking |
| Example | Longest substring with at most k distinct | Shortest subarray with sum ≥ target |

## Pitfall: Using a sliding window when numbers can be negative

```python
def shortest_sum_at_least(nums, target):
    left = total = 0
    best = float("inf")
    for right, x in enumerate(nums):
        total += x
        while total >= target:
            best = min(best, right - left + 1)
            total -= nums[left]
            left += 1
    return best

print(shortest_sum_at_least([5, -10, 4, 6], 10), "but [4, 6] has length 2")
```

Shrinking only makes sense if adding items never decreases the sum. With negatives, a window can become valid again after shrinking, so this template misses answers. Those problems need prefix sums with a deque or a hash map instead.

## Quiz

### Which phrase suggests a sliding window?
- [ ] "longest increasing subsequence"
- [x] "longest substring without repeating characters"
- [ ] "number of subsets that sum to k"
Why: Substrings and subarrays are contiguous, which is what a window covers. Subsequences and subsets skip items.

### Why is the variable window O(n) even with a while loop inside the for loop?
- [ ] The while loop runs at most once
- [x] The left edge only moves forward, at most n times in total
- [ ] Python optimizes it
Why: Each item enters the window once (right edge) and leaves at most once (left edge), so total work is O(n).

## Exercise: longest-no-repeat | Longest substring without repeats
Write `longest_unique(s)` that returns the length of the longest substring of `s` with no repeated characters, in O(n). Keep the window's characters in a set (or the last index of each character in a dict).

```python starter
def longest_unique(s):
    # TODO: grow right; while the new char is already in the window, shrink left
    pass
```

```python checks
check("abcabcbb", lambda: longest_unique("abcabcbb"), 3)
check("all same", lambda: longest_unique("bbbbb"), 1)
check("pwwkew", lambda: longest_unique("pwwkew"), 3)
check("empty", lambda: longest_unique(""), 0)
check("space counts", lambda: longest_unique("a b"), 3)
check("long input", lambda: longest_unique("abcdefghijklmnopqrstuvwxyz" * 4000), 26)
```

## Ladder
- easy: Best Time to Buy and Sell Stock
- easy: Maximum Average Subarray I
- medium: Longest Substring Without Repeating Characters
- medium: Longest Repeating Character Replacement
- medium: Permutation in String
- medium: Minimum Size Subarray Sum
- hard: Minimum Window Substring
- hard: Sliding Window Maximum
