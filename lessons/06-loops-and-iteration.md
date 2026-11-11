---
id: loops-and-iteration
unit: 1
title: Loops and iteration
minutes: 25
summary: Python loops walk over things, not over index numbers. enumerate, zip, range and reversed cover almost every loop you'll write, and choosing the right one removes off-by-one bugs.
---

## for loops walk over iterables

A `for` loop takes items one at a time from anything iterable: lists, strings, dicts, sets, ranges, files. You rarely need `range(len(...))`.

```python
for ch in "hey":
    print(ch, end=" ")
print()
for i in range(2, 11, 4):
    print(i, end=" ")
print()
for i in range(5, 0, -2):
    print(i, end=" ")
print()
```

`range(start, stop, step)` stops *before* `stop`, just like slices. A negative step counts down.

## enumerate and zip

When you need the index too, use `enumerate`. To walk two sequences side by side, use `zip`, which stops at the shorter one.

```python
names = ["ana", "bo", "cy"]
scores = [90, 85, 77]
for i, name in enumerate(names, start=1):
    print(i, name)
for name, score in zip(names, scores):
    print(f"{name}: {score}")
pairs = list(zip([1, 2, 3], "ab"))
print(pairs)
```

## Walking backwards and in pairs

`reversed()` walks a sequence from the end without copying it. Comparing each item with the next one is a very common pattern: `zip(a, a[1:])`.

```python
nums = [1, 3, 6, 10]
for x in reversed(nums):
    print(x, end=" ")
print()
gaps = [b - a for a, b in zip(nums, nums[1:])]
print(gaps)
print(all(a <= b for a, b in zip(nums, nums[1:])))
```

The last line checks whether a list is sorted.

## while loops, break and continue

Use `while` when you don't know in advance how many steps you need, like two pointers moving toward each other. `break` leaves the loop, `continue` skips to the next round, and a loop's `else` runs only if it finished **without** `break`.

```python
n = 37
d = 2
while d * d <= n:
    if n % d == 0:
        print(n, "is divisible by", d)
        break
    d += 1
else:
    print(n, "is prime")

for x in [1, -2, 3, -4]:
    if x < 0:
        continue
    print("positive", x)
```

## Compare: Which loop?

| You want | Write |
|---|---|
| Each item | `for x in items:` |
| Each item and its index | `for i, x in enumerate(items):` |
| Two lists side by side | `for a, b in zip(xs, ys):` |
| Each item and the next one | `for a, b in zip(xs, xs[1:]):` |
| Backwards | `for x in reversed(items):` or `range(n - 1, -1, -1)` |
| Until a condition holds | `while condition:` |

## Pitfall: Off-by-one when counting down

```python
n = 4
print(list(range(n, 0, -1)))
print(list(range(n - 1, -1, -1)))
```

To visit indexes `n-1` down to `0`, the stop must be `-1`, because `range` stops before it. `reversed(range(n))` is easier to get right.

## Pitfall: Changing the loop variable doesn't skip ahead

```python
for i in range(5):
    if i == 1:
        i += 2
    print(i, end=" ")
print()
```

`range` hands out the next number no matter what you did to `i`. When you need to jump, use a `while` loop and move the index yourself.

## Quiz

### What does `list(range(1, 10, 3))` give?
- [x] `[1, 4, 7]`
- [ ] `[1, 4, 7, 10]`
- [ ] `[3, 6, 9]`
Why: Start at 1, add 3 each time, and stop before 10.

### What does `list(zip([1, 2, 3], "ab"))` give?
- [ ] An error, the lengths differ
- [x] `[(1, "a"), (2, "b")]`
- [ ] `[(1, "a"), (2, "b"), (3, None)]`
Why: `zip` stops at the shortest input.

### When does a `for` loop's `else` block run?
- [ ] When the loop body raised an error
- [x] When the loop finished without hitting `break`
- [ ] Always, after the loop
Why: `for ... else` is for "searched everything and didn't find it", which is exactly when no `break` happened.

## Exercise: running-max | Running maximum
Write `running_max(nums)` that returns a list where position `i` holds the largest value among `nums[0]` through `nums[i]`. One pass, no slicing inside the loop.

```python starter
def running_max(nums):
    # TODO: keep the best so far as you walk the list
    pass
```

```python checks
check("basic", lambda: running_max([3, 1, 4, 1, 5, 9, 2]), [3, 3, 4, 4, 5, 9, 9])
check("empty", lambda: running_max([]), [])
check("decreasing", lambda: running_max([5, 4, 3]), [5, 5, 5])
check("negatives", lambda: running_max([-3, -1, -2]), [-3, -1, -1])
```

## Exercise: merge-sorted | Merge two sorted lists
Write `merge(a, b)` that merges two sorted lists into one sorted list in O(len(a) + len(b)), using two indexes and a `while` loop. Don't call `sorted` or `sort`. This is the heart of merge sort, and of many two-pointer problems.

```python starter
def merge(a, b):
    # TODO: compare a[i] and b[j], take the smaller, move that index
    pass
```

```python checks
check("basic", lambda: merge([1, 4, 7], [2, 3, 9]), [1, 2, 3, 4, 7, 9])
check("one empty", lambda: merge([], [1, 2]), [1, 2])
check("both empty", lambda: merge([], []), [])
check("duplicates", lambda: merge([1, 2, 2], [2, 3]), [1, 2, 2, 2, 3])
check("leftovers", lambda: merge([10, 11, 12], [1]), [1, 10, 11, 12])
```
