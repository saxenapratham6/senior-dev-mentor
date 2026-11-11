---
id: collections
unit: 2
title: deque, Counter and defaultdict
minutes: 25
summary: The collections module has three tools you'll reach for in almost every medium problem. A deque for queues and BFS, a Counter for counting, and a defaultdict for grouping and graphs.
---

## deque: a fast double-ended queue

`collections.deque` adds and removes at **both** ends in O(1). A list can only do that at the end. Use a deque for queues, breadth-first search and sliding windows.

```python
from collections import deque

q = deque([1, 2, 3])
q.append(4)
q.appendleft(0)
print(q.popleft(), q.pop(), list(q))

recent = deque(maxlen=3)
for x in range(6):
    recent.append(x)
print(list(recent))
```

With `maxlen`, adding to a full deque drops the item at the other end, which is perfect for "the last k items".

## A queue for breadth-first search

BFS explores in rings: everything 1 step away, then 2 steps, and so on. A deque gives O(1) `popleft`, so BFS stays O(V + E).

```python
from collections import deque

graph = {"A": ["B", "C"], "B": ["D"], "C": ["D", "E"], "D": [], "E": []}
dist = {"A": 0}
q = deque(["A"])
while q:
    node = q.popleft()
    for nxt in graph[node]:
        if nxt not in dist:
            dist[nxt] = dist[node] + 1
            q.append(nxt)
print(dist)
```

## Counter: counting made easy

`Counter` counts hashable items. Missing keys read as 0, `most_common(k)` returns the top k, and counters can be added, subtracted and compared.

```python
from collections import Counter

c = Counter("mississippi")
print(c["s"], c["z"])
print(c.most_common(2))
print(Counter("listen") == Counter("silent"))
need = Counter("abc")
have = Counter("aabd")
print(need - have)
```

`need - have` keeps only the positive leftovers: what you still need.

## defaultdict: no more missing-key checks

`defaultdict(factory)` creates a default value the first time you touch a missing key. `defaultdict(list)` is the standard way to build adjacency lists and groups.

```python
from collections import defaultdict

edges = [("a", "b"), ("a", "c"), ("b", "c")]
graph = defaultdict(list)
for u, v in edges:
    graph[u].append(v)
    graph[v].append(u)
print(dict(graph))

by_len = defaultdict(list)
for w in ["hi", "cat", "ox", "dog"]:
    by_len[len(w)].append(w)
print(dict(by_len))
```

## Compare: Which one?

| You want | Use | Instead of |
|---|---|---|
| A queue, BFS, or the last k items | `deque` | `list.pop(0)`, which is O(n) |
| Count things, compare counts, top k | `Counter` | A dict with `.get(x, 0) + 1` |
| Group items or build a graph | `defaultdict(list)` | `setdefault` everywhere |
| Count without Counter's extras | `defaultdict(int)` | `.get(x, 0) + 1` |

## Pitfall: Reading a defaultdict adds keys

```python
from collections import defaultdict

d = defaultdict(int)
if d["ghost"] == 0:
    print("not there")
print(dict(d))
```

Just *looking up* a missing key inserts it. Use `"ghost" in d` to test membership without side effects.

## Pitfall: Indexing into the middle of a deque

```python
from collections import deque

d = deque(range(5))
print(d[0], d[-1])
try:
    print(d[1:3])
except TypeError as e:
    print("TypeError:", e)
```

The ends are O(1), but `d[i]` in the middle is O(n), and deques don't support slicing. If you need random access, use a list.

## Quiz

### Why use a deque instead of a list for BFS?
- [ ] Deques are sorted
- [x] `popleft()` is O(1) on a deque but `pop(0)` is O(n) on a list
- [ ] Lists can't hold tuples
Why: BFS removes from the front constantly. A list shifts every element each time.

### What is `Counter("aab")["z"]`?
- [ ] KeyError
- [ ] None
- [x] 0
Why: Counters return 0 for missing keys, without raising or inserting.

### What does `defaultdict(list)` give you for a new key?
- [x] A fresh empty list
- [ ] None
- [ ] A shared empty list
Why: The factory `list` is called each time a missing key is touched, so every key gets its own list.

## Exercise: is-anagram-groups | Group anagrams
Write `group_anagrams(words)` that groups words that are anagrams of each other. Return a list of groups, each group sorted alphabetically, and the groups sorted by their first word. Use a `defaultdict(list)` keyed by something all anagrams share.

```python starter
from collections import defaultdict


def group_anagrams(words):
    # TODO: what key do "eat", "tea" and "ate" have in common?
    pass
```

```python checks
check("basic", lambda: group_anagrams(["eat", "tea", "tan", "ate", "nat", "bat"]), [["ate", "eat", "tea"], ["bat"], ["nat", "tan"]])
check("empty string", lambda: group_anagrams([""]), [[""]])
check("none", lambda: group_anagrams([]), [])
check("repeats", lambda: group_anagrams(["ab", "ba", "ab"]), [["ab", "ab", "ba"]])
```

## Exercise: recent-counter | Requests in the last 3000 ms
Write a class `RecentCounter` with a method `ping(t)` that records a request at time `t` (milliseconds, always increasing) and returns how many requests happened in `[t - 3000, t]`. Each ping should be O(1) on average: keep the times in a deque and drop old ones from the left.

```python starter
from collections import deque


class RecentCounter:
    def __init__(self):
        # TODO
        pass

    def ping(self, t):
        pass
```

```python checks
def run(times):
    rc = RecentCounter()
    return [rc.ping(t) for t in times]
check("basic", lambda: run([1, 100, 3001, 3002]), [1, 2, 3, 3])
check("all old", lambda: run([1, 5000, 10000]), [1, 1, 1])
check("many pings", lambda: run(list(range(0, 100000, 10)))[-1], 301)
```
