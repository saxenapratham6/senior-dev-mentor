---
id: hashing-and-prefix-sums
unit: 3
title: Hash maps and prefix sums
minutes: 35
summary: A hash map turns "have I seen what I need?" into an O(1) question. Combined with prefix sums, it counts subarrays with a given sum in one pass, even with negative numbers, where sliding windows fail.
---

## Signals
- "Find a pair / complement" in unsorted data
- Counting occurrences, grouping, or detecting duplicates
- "Number of subarrays whose sum is ..." (especially with negatives)
- Comparing two strings as bags of letters (anagrams)
- You'd like O(n), and a nested loop is O(n²)

## Remember what you've seen

The core move: as you scan, store what you've seen in a dict, and for each new item ask the dict whether its **complement** has appeared.

```python
def contains_nearby_duplicate(nums, k):
    last_seen = {}
    for i, x in enumerate(nums):
        if x in last_seen and i - last_seen[x] <= k:
            return True
        last_seen[x] = i
    return False

print(contains_nearby_duplicate([1, 2, 3, 1], 3))
print(contains_nearby_duplicate([1, 2, 3, 1], 2))
```

## Prefix sums plus a hash map

The sum of `nums[i:j]` is `prefix[j] - prefix[i]`. So a subarray ending at `j` sums to `k` exactly when some earlier prefix equals `prefix[j] - k`. Store prefix sums in a dict as you go.

```python
def longest_subarray_with_sum(nums, k):
    first_index = {0: -1}
    total = best = 0
    for j, x in enumerate(nums):
        total += x
        if total - k in first_index:
            best = max(best, j - first_index[total - k])
        first_index.setdefault(total, j)
    return best

print(longest_subarray_with_sum([1, -1, 5, -2, 3], 3))
print(longest_subarray_with_sum([-2, -1, 2, 1], 1))
```

Storing the **first** index of each prefix sum gives the longest subarray. The `{0: -1}` entry handles subarrays that start at index 0. Negatives are fine, unlike the sliding window.

## Tracing the prefix map

Seeing the dict evolve makes the trick concrete.

```python
nums, k = [3, 4, 7, 2, -3, 1, 4, 2], 7
seen = {0: 1}
total = count = 0
for x in nums:
    total += x
    count += seen.get(total - k, 0)
    seen[total] = seen.get(total, 0) + 1
    print(f"x={x:>2} total={total:>2} found_so_far={count}")
```

To **count** subarrays (instead of finding the longest), store how many times each prefix sum has appeared.

## Compare: Which tool for subarray sums?

| Situation | Tool | Why |
|---|---|---|
| All numbers non-negative | Sliding window | Growing the window only increases the sum |
| Negatives possible | Prefix sums + hash map | Doesn't depend on the sum moving one way |
| Many range-sum queries, no updates | Prefix sum array | Each query is O(1) |
| Sum divisible by k | Prefix sums mod k + hash map | Equal remainders mean the difference is divisible by k |

## Pitfall: Forgetting the empty prefix

```python
def count_subarrays(nums, k):
    seen, total, count = {}, 0, 0
    for x in nums:
        total += x
        count += seen.get(total - k, 0)
        seen[total] = seen.get(total, 0) + 1
    return count

print(count_subarrays([2, 3], 5), "but [2, 3] itself sums to 5")
```

Subarrays starting at index 0 need "prefix sum 0 has been seen once" before the loop. Start with `seen = {0: 1}`.

## Quiz

### Why does a sliding window fail for "count subarrays summing to k" with negative numbers?
- [x] Shrinking the window doesn't reliably move the sum in one direction
- [ ] Windows can't hold negative numbers
- [ ] It's too slow
Why: With negatives, removing an item can increase the sum, so the window's "valid / invalid" logic breaks.

### In the counting version, what does `seen[s]` store?
- [ ] The index where prefix sum `s` first appeared
- [x] How many earlier prefixes had sum `s`
- [ ] The subarray itself
Why: Each earlier prefix with sum `total - k` marks a different starting point of a subarray summing to k.

## Exercise: divisible-subarrays | Subarray sums divisible by k
Write `count_divisible(nums, k)` that returns how many non-empty contiguous subarrays have a sum divisible by `k` (`k >= 1`), in O(n). Two prefix sums with the same remainder mod k bound a subarray whose sum is divisible by k. Python's `%` always returns a non-negative remainder for positive k, which helps with negative numbers.

```python starter
def count_divisible(nums, k):
    # TODO: count prefix-sum remainders as you go; start with remainder 0 seen once
    pass
```

```python checks
check("example", lambda: count_divisible([4, 5, 0, -2, -3, 1], 5), 7)
check("single", lambda: count_divisible([5], 9), 0)
check("negatives", lambda: count_divisible([-1, 2, 9], 2), 2)
check("all divisible", lambda: count_divisible([3, 3, 3], 3), 6)
check("big input", lambda: count_divisible([1] * 100000, 1), 100000 * 100001 // 2)
```

## Ladder
- easy: Two Sum
- easy: Contains Duplicate
- easy: Valid Anagram
- medium: Group Anagrams
- medium: Subarray Sum Equals K
- medium: Longest Consecutive Sequence
- medium: Contiguous Array
- hard: First Missing Positive
- hard: Substring with Concatenation of All Words
