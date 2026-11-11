---
id: tuples
unit: 1
title: Tuples, and when to choose them over lists
minutes: 25
summary: A tuple is a fixed-size, unchangeable group of values. That immutability is the whole point. It makes tuples hashable, so they can be dictionary keys and set members, which lists can never be.
---

## What a tuple is

A tuple is an ordered, **immutable** sequence. You can index and slice it like a list, but you can't append, remove or reassign items. Parentheses are optional; the commas make the tuple.

```python
point = (3, 4)
also_a_tuple = 3, 4
single = (7,)
not_a_tuple = (7)
print(point == also_a_tuple, type(single).__name__, type(not_a_tuple).__name__)
print(point[0], point[-1], len(point))
```

A one-item tuple needs a trailing comma: `(7)` is just the number 7 in parentheses.

## The real reason to use a tuple: it's hashable

Dictionary keys and set members must be **hashable**: their hash can never change. A list can change after you put it in a set, so Python refuses. A tuple of immutable values can't change, so it works. This is why grid problems use `(row, col)` tuples to remember visited cells.

```python
visited = set()
visited.add((0, 0))
visited.add((0, 1))
print((0, 1) in visited, (1, 1) in visited)

distance = {("A", "B"): 5, ("B", "C"): 2}
print(distance[("A", "B")])

try:
    visited.add([2, 2])
except TypeError as e:
    print("TypeError:", e)
```

## Packing and unpacking

Writing `a, b = b, a` builds a tuple on the right and unpacks it on the left, so you can swap without a temporary variable. Functions return several values the same way, and `*rest` collects whatever is left.

```python
a, b = 1, 2
a, b = b, a
print(a, b)

def min_max(nums):
    return min(nums), max(nums)

low, high = min_max([4, 9, 1])
first, *middle, last = [1, 2, 3, 4, 5]
print(low, high, first, middle, last)

for name, score in [("ana", 90), ("bo", 85)]:
    print(name, score)
```

## Tuples sort naturally

Tuples compare item by item, left to right. That makes them perfect sort keys and heap entries: `(priority, task)` sorts by priority first, then by task.

```python
tasks = [(2, "write tests"), (1, "fix bug"), (2, "deploy"), (1, "coffee")]
print(sorted(tasks))
print((1, 99) < (2, 0), (1, 2) < (1, 2, 0))
```

## Named tuples: readable records

When a tuple's positions have meanings, `namedtuple` lets you use names instead of `[0]` and `[1]`, while staying a light, immutable tuple.

```python
from collections import namedtuple

Point = namedtuple("Point", ["x", "y"])
p = Point(3, 4)
print(p.x, p.y, p)
print((p.x ** 2 + p.y ** 2) ** 0.5)
```

## Compare: List or tuple?

| | list | tuple |
|---|---|---|
| Can change after creation | Yes: append, remove, assign | No |
| Can be a dict key or set item | No, it's unhashable | Yes, if everything inside is hashable |
| Typical meaning | Many items of the same kind ("all the scores") | A fixed record ("this point's x and y") |
| Size | Grows and shrinks | Fixed |
| Speed and memory | Slightly more overhead | Slightly faster to create, smaller |
| Use in LeetCode | Stacks, results, DP tables | Grid coordinates, dict keys, heap entries, returning several values |

The rule of thumb: if the collection will grow or change, use a list. If it's a fixed group of values that belong together, or you need it as a key, use a tuple.

## Pitfall: Forgetting the comma

```python
colors = ("red")
for c in colors:
    print(c)
```

`("red")` is just a string, so the loop walks its letters. Write `("red",)` for a one-item tuple.

## Pitfall: A tuple holding a list isn't frozen

```python
t = (1, [2, 3])
t[1].append(4)
print(t)
try:
    hash(t)
except TypeError as e:
    print("TypeError:", e)
```

The tuple can't change which objects it holds, but a list inside it can still change. That's also why such a tuple isn't hashable.

## Quiz

### Why can `(2, 3)` be a dictionary key but `[2, 3]` can't?
- [ ] Lists are slower
- [x] Lists can change, so their hash could change; tuples can't
- [ ] Dictionaries only accept numbers and tuples
Why: Keys must stay findable, so their hash must never change. Only immutable (hashable) values qualify.

### What is `type((5))`?
- [x] `int`
- [ ] `tuple`
- [ ] `list`
Why: Parentheses alone just group. The comma makes a tuple: `(5,)`.

### Which is the best choice for storing visited cells in a grid search?
- [ ] A list of lists `[[r, c], ...]`
- [x] A set of tuples `{(r, c), ...}`
- [ ] A string like `"r,c"` in a list
Why: Sets check membership in O(1), and tuples can go in sets. A list would make every `in` check O(n).

## Exercise: count-visits | Distinct cells visited
A robot starts at `(0, 0)` and follows a string of moves: `U`, `D`, `L`, `R`. Write `cells_visited(moves)` that returns how many **distinct** cells it visits, including the start. Store positions as tuples in a set.

```python starter
def cells_visited(moves):
    # TODO: keep the current (row, col) and a set of tuples you've seen
    pass
```

```python checks
check("no moves", lambda: cells_visited(""), 1)
check("straight line", lambda: cells_visited("RRR"), 4)
check("back and forth", lambda: cells_visited("RLRL"), 2)
check("a square", lambda: cells_visited("URDL"), 4)
check("long walk", lambda: cells_visited("UUDDLRLR" * 50), 4)
```

## Exercise: group-points | Group points by distance
Write `group_by_distance(points)` that takes a list of `(x, y)` tuples and returns a dict mapping each squared distance from the origin (`x*x + y*y`) to a **sorted** list of the points at that distance.

```python starter
def group_by_distance(points):
    # TODO: tuple unpacking, a dict of lists, then sort each list
    pass
```

```python checks
check("basic", lambda: group_by_distance([(1, 0), (0, 1), (1, 1)]), {1: [(0, 1), (1, 0)], 2: [(1, 1)]})
check("empty", lambda: group_by_distance([]), {})
check("negatives", lambda: group_by_distance([(-3, 4), (5, 0), (0, 0)]), {25: [(-3, 4), (5, 0)], 0: [(0, 0)]})
check("duplicates kept", lambda: group_by_distance([(1, 0), (1, 0)]), {1: [(1, 0), (1, 0)]})
```
