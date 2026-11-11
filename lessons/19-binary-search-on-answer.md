---
id: binary-search-on-answer
unit: 3
title: Binary search, including on the answer
minutes: 40
summary: Binary search isn't only for finding a value in a sorted array. Whenever a yes/no question about a number flips from no to yes exactly once, you can binary search for that number, and many hard problems hide exactly that.
---

## Signals
- A sorted (or rotated sorted) array, and O(log n) is expected
- "Minimum possible maximum" or "maximum possible minimum"
- "Smallest speed / capacity / size such that ..."
- Checking one candidate answer is easy, but finding the best one directly is hard
- Constraints like values up to 10⁹, where trying every value is too slow

## The template: first value where the test is true

Reuse the same function every time. Define `ok(x)` so that it's false for small x and true from some point on. The search returns that point.

```python
def first_true(lo, hi, ok):
    """Smallest x in [lo, hi] with ok(x) True; hi if none before it."""
    while lo < hi:
        mid = (lo + hi) // 2
        if ok(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo

nums = [1, 4, 4, 7, 9]
print(first_true(0, len(nums), lambda i: nums[i] >= 4))
print(first_true(0, len(nums), lambda i: nums[i] > 4))
```

## Worked example: smallest divisor

Divide every number by a divisor d, rounding each result **up**, and add them. Find the smallest d whose total is at most `threshold`. A bigger d always gives a smaller total, so "total(d) <= threshold" flips from false to true exactly once: binary search over d.

```python
def smallest_divisor(nums, threshold):
    def ok(d):
        return sum((x + d - 1) // d for x in nums) <= threshold

    return first_true(1, max(nums), ok)

def first_true(lo, hi, ok):
    while lo < hi:
        mid = (lo + hi) // 2
        if ok(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo

print(smallest_divisor([1, 2, 5, 9], 6))
print(smallest_divisor([44, 22, 33, 11, 1], 5))
```

`(x + d - 1) // d` rounds up without floats. The search tries about log₂(max) values of d, each checked in O(n): O(n log max) instead of O(n × max).

## Rotated sorted arrays

A sorted array rotated at an unknown point still has structure: at least one half around `mid` is sorted. The minimum is the first element smaller than the last element.

```python
def find_min_rotated(nums):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] > nums[hi]:
            lo = mid + 1
        else:
            hi = mid
    return nums[lo]

print(find_min_rotated([4, 5, 6, 7, 0, 1, 2]))
print(find_min_rotated([1, 2, 3]))
```

## Compare: Classic search or search on the answer?

| | Search in an array | Search on the answer |
|---|---|---|
| Range | Indexes `0` to `n` | Possible answers, like 1 to max(nums) |
| The test | `nums[mid] >= target` | `ok(mid)`: can it be done with this value? |
| Cost | O(log n) | O(log(range) × cost of `ok`) |
| Spotting it | "sorted array" | "minimum value such that…", "maximum minimum…" |

## Pitfall: A test that doesn't flip just once

```python
def first_true(lo, hi, ok):
    while lo < hi:
        mid = (lo + hi) // 2
        if ok(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo

values = [3, 8, 1, 9, 2]
print(first_true(0, len(values), lambda i: values[i] > 5), "but index 1 holds 8")
```

The answer is only correct when the test is monotonic: false, false, then true forever. On unsorted values the search jumps over answers. Before coding, convince yourself that "if x works, every bigger x works too".

## Quiz

### What must be true of `ok(x)` for binary search on the answer?
- [ ] It's fast
- [x] Once it's true for some x, it stays true for every larger x
- [ ] It returns a number
Why: Binary search discards half the range each step, which is only safe when the test is monotonic.

### "Find the minimum eating speed so all bananas are eaten within h hours." What do you binary search over?
- [ ] The pile indexes
- [x] The speed
- [ ] The hours
Why: For a given speed you can check quickly whether h hours is enough, and faster speeds only help.

## Exercise: ship-capacity | Ship packages within d days
Packages with weights `weights` must ship **in order**. Each day you load packages until the next one would exceed the ship's capacity. Write `min_capacity(weights, days)` that returns the smallest capacity that ships everything within `days` days. Write `ok(cap)` first, then binary search between `max(weights)` and `sum(weights)`.

```python starter
def min_capacity(weights, days):
    # TODO: can_ship(cap) counts days needed; binary search the smallest cap
    pass
```

```python checks
check("example", lambda: min_capacity([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5), 15)
check("three days", lambda: min_capacity([3, 2, 2, 4, 1, 4], 3), 6)
check("one day", lambda: min_capacity([1, 2, 3, 1, 1], 1), 8)
check("a day per package", lambda: min_capacity([5, 1, 7], 3), 7)
check("big input", lambda: min_capacity([500] * 50000, 10), 2500000)
```

## Ladder
- easy: Binary Search
- easy: Search Insert Position
- medium: Find Minimum in Rotated Sorted Array
- medium: Search in Rotated Sorted Array
- medium: Koko Eating Bananas
- medium: Capacity To Ship Packages Within D Days
- hard: Split Array Largest Sum
- hard: Median of Two Sorted Arrays
