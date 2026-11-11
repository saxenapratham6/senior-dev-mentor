---
id: dicts-and-sets
unit: 1
title: Dictionaries and sets
minutes: 30
summary: Dictionaries and sets find things in O(1) on average by hashing. Swapping a list scan for a dict or set lookup is the single most common way to turn a slow solution into a fast one.
---

## How hashing makes lookups fast

A dict computes `hash(key)` to jump almost directly to where the value lives, instead of scanning. So `key in d`, `d[key]` and `d[key] = value` are O(1) on average, no matter how big the dict is. Sets work the same way, but store only keys.

```python
ages = {"ana": 20, "bo": 22}
ages["cy"] = 19
print(ages["bo"], "cy" in ages, len(ages))
del ages["ana"]
print(ages)
print(list(ages.keys()), list(ages.values()))
```

Since Python 3.7, dicts remember insertion order, so looping over a dict gives keys in the order you added them.

## Reading safely: get and setdefault

`d[key]` raises a KeyError when the key is missing. `d.get(key, default)` returns the default instead. `setdefault` inserts a default only if the key is missing, then returns the value, which is handy for grouping.

```python
counts = {}
for word in "the cat and the hat".split():
    counts[word] = counts.get(word, 0) + 1
print(counts)

groups = {}
for word in ["eat", "tea", "tan", "ate", "nat"]:
    groups.setdefault("".join(sorted(word)), []).append(word)
print(groups)
```

Sorting a word's letters gives the same key for every anagram, so anagrams land in the same group.

## Looping over a dict

Iterate with `.items()` to get key and value together. Dict comprehensions build a new dict in one line.

```python
scores = {"ana": 91, "bo": 78, "cy": 85}
for name, score in scores.items():
    print(name, score)
passed = {name: s for name, s in scores.items() if s >= 80}
best = max(scores, key=scores.get)
print(passed, best)
```

`max(scores, key=scores.get)` returns the key with the largest value.

## Sets and set algebra

A set holds unique, hashable items. Use one to remove duplicates or to ask "have I seen this?" in O(1). The operators `|`, `&`, `-` and `^` mean union, intersection, difference and symmetric difference.

```python
seen = set()
for x in [3, 1, 3, 2, 1]:
    if x in seen:
        print("duplicate", x)
    seen.add(x)
a, b = {1, 2, 3}, {2, 3, 4}
print(a | b, a & b, a - b, a ^ b)
print(sorted(set("mississippi")))
```

Sets have no order, so sort them before printing when order matters.

## Compare: list, set or dict?

| You need to | Use | Lookup cost |
|---|---|---|
| Keep items in order, allow duplicates | list | `x in list` is O(n) |
| Ask "have I seen x?" or remove duplicates | set | `x in set` is O(1) average |
| Look up a value by key (counts, indexes, groups) | dict | `d[key]` is O(1) average |
| Use a group of values as a key | tuple key in a dict or set | O(1) average |

## Pitfall: Missing keys

```python
counts = {}
counts["a"] += 1
```

You can't add to a key that doesn't exist yet. Use `counts.get("a", 0) + 1`, `collections.defaultdict(int)` or `collections.Counter` (lesson 12).

## Pitfall: Changing a dict while looping over it

```python
d = {"a": 1, "b": 2, "c": 3}
for k in d:
    if d[k] % 2:
        del d[k]
```

Loop over a copy of the keys (`for k in list(d):`) or build a new dict with a comprehension.

## Pitfall: An empty set

```python
empty = {}
print(type(empty).__name__, type(set()).__name__)
```

`{}` is an empty **dict**. Write `set()` for an empty set.

## Quiz

### What is the average cost of `x in some_set`?
- [x] O(1)
- [ ] O(log n)
- [ ] O(n)
Why: Sets hash `x` to jump straight to where it would be. Lists have to scan, which is O(n).

### What does `{"a": 1}.get("b", 0)` return?
- [ ] KeyError
- [ ] None
- [x] 0
Why: `get` returns the default you pass when the key is missing. Without a default it returns None.

### Which can't be a dictionary key?
- [ ] `"name"`
- [ ] `(1, 2)`
- [x] `[1, 2]`
- [ ] `42`
Why: Lists are mutable, so they're unhashable. Strings, tuples of hashable things and numbers are all fine.

## Exercise: two-sum-indices | Pair that adds up
Write `pair_indices(nums, target)` that returns a tuple `(i, j)` with `i < j` and `nums[i] + nums[j] == target`, or `None` if there isn't one. Return the pair whose `j` is smallest. Do it in **one pass** with a dict that remembers where you saw each number.

```python starter
def pair_indices(nums, target):
    # TODO: for each number, ask the dict whether its partner was seen earlier
    pass
```

```python checks
check("basic", lambda: pair_indices([2, 7, 11, 15], 9), (0, 1))
check("later pair", lambda: pair_indices([3, 2, 4], 6), (1, 2))
check("same value twice", lambda: pair_indices([3, 3], 6), (0, 1))
check("none", lambda: pair_indices([1, 2, 3], 100), None)
check("fast enough", lambda: pair_indices(list(range(200000)), 399997), (199998, 199999))
```

## Exercise: first-unique | First unique character
Write `first_unique(s)` that returns the index of the first character that appears exactly once in `s`, or -1 if there is none. Count first, then make a second pass.

```python starter
def first_unique(s):
    # TODO: one pass to count, one pass to find the first count of 1
    pass
```

```python checks
check("basic", lambda: first_unique("leetcode"), 0)
check("middle", lambda: first_unique("loveleetcode"), 2)
check("none", lambda: first_unique("aabb"), -1)
check("empty", lambda: first_unique(""), -1)
check("last one", lambda: first_unique("aabbc"), 4)
```
