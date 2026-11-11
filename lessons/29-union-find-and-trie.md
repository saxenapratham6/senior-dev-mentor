---
id: union-find-and-trie
unit: 3
title: Union-find and tries
minutes: 40
summary: Two small data structures unlock a family of hard problems. Union-find tracks which items are connected as edges arrive, in nearly O(1) per operation. A trie stores words by their prefixes, so prefix searches don't scan every word.
---

## Signals
- "Are these connected?" asked repeatedly while connections are added
- Count groups, merge accounts, detect a redundant edge (a cycle) in an undirected graph
- Words with shared prefixes: autocomplete, "starts with", word search for many words
- Dictionary of words plus a grid or stream of letters

## Union-find (disjoint set union)

Each item points to a parent; following parents leads to the group's root. `find` returns the root, and `union` links two roots. **Path compression** makes later finds short, and **union by size** keeps trees flat.

```python
class DSU:
    def __init__(self, n):
        self.parent = list(range(n))
        self.size = [1] * n
        self.groups = n

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        self.size[ra] += self.size[rb]
        self.groups -= 1
        return True

d = DSU(6)
for a, b in [(0, 1), (1, 2), (3, 4)]:
    d.union(a, b)
print(d.groups, d.find(2) == d.find(0), d.find(3) == d.find(5))
print(d.union(0, 2), "(already connected)")
```

`union` returning False means the two were already connected: adding that edge would form a cycle.

## Worked example: finding the redundant edge

Add edges one by one. The first edge whose endpoints are already connected is the one that creates a cycle.

```python
def redundant_edge(n, edges):
    parent = list(range(n + 1))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra == rb:
            return [a, b]
        parent[ra] = rb
    return None

print(redundant_edge(5, [(1, 2), (2, 3), (3, 4), (1, 4), (1, 5)]))
print(redundant_edge(3, [(1, 2), (1, 3), (2, 3)]))
```

## Tries: words by prefix

A trie is a tree where each edge is a character. Words sharing a prefix share the path for it, so "do any words start with `ca`?" walks just two nodes. A dict of dicts is the simplest implementation.

```python
class Trie:
    def __init__(self):
        self.root = {}

    def insert(self, word):
        node = self.root
        for ch in word:
            node = node.setdefault(ch, {})
        node["$"] = True

    def _walk(self, prefix):
        node = self.root
        for ch in prefix:
            if ch not in node:
                return None
            node = node[ch]
        return node

    def contains(self, word):
        node = self._walk(word)
        return node is not None and "$" in node

    def starts_with(self, prefix):
        return self._walk(prefix) is not None

t = Trie()
for w in ["cat", "car", "card", "dog"]:
    t.insert(w)
print(t.contains("car"), t.contains("ca"), t.starts_with("ca"), t.starts_with("cow"))
```

The `"$"` key marks "a word ends here", so `ca` is a prefix but not a word.

## Counting words under a prefix

Storing a counter at each node answers "how many words start with this prefix?" in O(length of the prefix).

```python
class CountingTrie:
    def __init__(self):
        self.root = {"#": 0}

    def insert(self, word):
        node = self.root
        node["#"] += 1
        for ch in word:
            node = node.setdefault(ch, {"#": 0})
            node["#"] += 1

    def count_prefix(self, prefix):
        node = self.root
        for ch in prefix:
            if ch not in node:
                return 0
            node = node[ch]
        return node["#"]

t = CountingTrie()
for w in ["apple", "app", "apply", "ape", "bat"]:
    t.insert(w)
print(t.count_prefix("ap"), t.count_prefix("app"), t.count_prefix("b"), t.count_prefix("z"))
```

## Compare: Union-find, DFS or a trie?

| Question | Best tool | Why |
|---|---|---|
| Connected? (graph given all at once) | DFS / BFS | One traversal answers it |
| Connected? (edges arrive over time) | Union-find | Each union/find is nearly O(1) |
| Does adding this edge make a cycle? | Union-find | `union` returns False |
| Many prefix lookups over a word list | Trie | O(prefix length), independent of word count |
| Exact word lookups only | A set | Simpler than a trie |

## Pitfall: Union without find

```python
parent = list(range(4))

def union_wrong(a, b):
    parent[a] = b

union_wrong(0, 1)
union_wrong(0, 2)
print(parent, "0 and 1 are no longer connected")
```

Linking `a` itself (not its root) overwrites its old parent and silently disconnects groups. Always link the **roots**: `parent[find(a)] = find(b)`.

## Quiz

### What does path compression do?
- [ ] Removes items from the set
- [x] Points nodes closer to their root while finding it, so later finds are faster
- [ ] Sorts the parents
Why: Flattening the path keeps the trees almost flat, which makes operations nearly O(1) on average.

### Why mark word endings in a trie with a special key like `"$"`?
- [ ] To save memory
- [x] So a prefix that isn't a full word isn't reported as a word
- [ ] Dictionaries need it
Why: After inserting "card", the path for "car" exists, but "car" is only a word if it was inserted too.

## Exercise: count-provinces | Count groups of friends
`n` people are numbered `0` to `n - 1`. Given friendship pairs, write `count_groups(n, pairs)` that returns the number of friend groups, where friendship is transitive (a friend of a friend is in your group). Use union-find with path compression.

```python starter
def count_groups(n, pairs):
    # TODO: parent list, find with path compression, union the roots
    pass
```

```python checks
check("example", lambda: count_groups(5, [(0, 1), (1, 2), (3, 4)]), 2)
check("no pairs", lambda: count_groups(3, []), 3)
check("all connected", lambda: count_groups(4, [(0, 1), (2, 3), (1, 2)]), 1)
check("repeated pairs", lambda: count_groups(3, [(0, 1), (1, 0), (0, 1)]), 2)
check("long chain", lambda: count_groups(200000, [(i, i + 1) for i in range(199999)]), 1)
```

## Ladder
- medium: Number of Provinces
- medium: Redundant Connection
- medium: Accounts Merge
- medium: Implement Trie (Prefix Tree)
- medium: Design Add and Search Words Data Structure
- medium: Most Stones Removed with Same Row or Column
- hard: Word Search II
- hard: Swim in Rising Water
