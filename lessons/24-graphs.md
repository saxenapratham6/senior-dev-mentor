---
id: graphs
unit: 3
title: Graphs, grids and topological sort
minutes: 45
summary: A graph is things plus connections. Grids are graphs in disguise. BFS finds shortest paths in unweighted graphs, DFS explores connected pieces, and topological sort orders tasks that depend on each other.
---

## Signals
- A grid of cells with neighbors, islands, regions, flood fill
- "Minimum number of steps / moves / transformations"
- Prerequisites, dependencies, build order, "can all courses be finished?"
- Friends, connections, networks, cities and roads
- Words that change one letter at a time

## Representing a graph

An **adjacency list** maps each node to its neighbors. Build it from an edge list with `defaultdict(list)`. For an undirected graph, add each edge in both directions.

```python
from collections import defaultdict

edges = [(0, 1), (0, 2), (1, 3), (2, 3), (4, 5)]
graph = defaultdict(list)
for u, v in edges:
    graph[u].append(v)
    graph[v].append(u)
for node in sorted(graph):
    print(node, graph[node])
```

## BFS: shortest paths in steps

BFS visits nodes in order of distance from the start, so the first time it reaches a node, that's the shortest path in steps. Mark nodes as visited when you **add** them to the queue, not when you pop them, or they get added many times.

```python
from collections import deque

def shortest_steps(grid, start, goal):
    rows, cols = len(grid), len(grid[0])
    q = deque([(start, 0)])
    seen = {start}
    while q:
        (r, c), d = q.popleft()
        if (r, c) == goal:
            return d
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "." and (nr, nc) not in seen:
                seen.add((nr, nc))
                q.append(((nr, nc), d + 1))
    return -1

maze = ["..#.",
        ".##.",
        "...."]
print(shortest_steps(maze, (0, 0), (0, 3)))
print(shortest_steps([".#", "#."], (0, 0), (1, 1)))
```

## DFS: exploring connected pieces

DFS goes as deep as possible before backtracking. To count connected components, start a DFS from every unvisited node; each start is a new component. An explicit stack avoids recursion limits on big grids.

```python
def count_components(n, edges):
    graph = {i: [] for i in range(n)}
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
    seen, components = set(), 0
    for start in range(n):
        if start in seen:
            continue
        components += 1
        stack = [start]
        seen.add(start)
        while stack:
            node = stack.pop()
            for nxt in graph[node]:
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
    return components

print(count_components(6, [(0, 1), (1, 2), (3, 4)]))
```

## Topological sort: an order that respects dependencies

In a directed graph without cycles, a topological order lists every node before the nodes that depend on it. **Kahn's algorithm**: repeatedly take a node with no remaining prerequisites (in-degree 0). If you can't take them all, there's a cycle.

```python
from collections import deque, defaultdict

def build_order(tasks, deps):
    graph = defaultdict(list)
    indegree = {t: 0 for t in tasks}
    for before, after in deps:
        graph[before].append(after)
        indegree[after] += 1
    q = deque(t for t in tasks if indegree[t] == 0)
    order = []
    while q:
        t = q.popleft()
        order.append(t)
        for nxt in graph[t]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                q.append(nxt)
    return order if len(order) == len(tasks) else None

print(build_order(["intro", "dsa", "algo", "ml"], [("intro", "dsa"), ("dsa", "algo"), ("intro", "ml")]))
print(build_order(["a", "b"], [("a", "b"), ("b", "a")]))
```

## Compare: BFS, DFS or topological sort?

| Question | Tool | Cost |
|---|---|---|
| Fewest steps from A to B (unweighted) | BFS | O(V + E) |
| Is there a path? How many pieces? Size of each region? | DFS or BFS | O(V + E) |
| Order tasks with prerequisites; detect a cycle in a directed graph | Topological sort (Kahn) | O(V + E) |
| Shortest path with weights | Dijkstra (a heap + BFS idea) | O(E log V) |
| Many "are these connected?" queries as edges arrive | Union-find (lesson 29) | Nearly O(1) each |

## Pitfall: Marking visited too late

```python
from collections import deque

def bfs_count_pushes(grid_size):
    q = deque([(0, 0)])
    seen = set()
    pushes = 1
    while q:
        r, c = q.popleft()
        if (r, c) in seen:
            continue
        seen.add((r, c))
        for nr, nc in ((r + 1, c), (r, c + 1)):
            if nr < grid_size and nc < grid_size:
                q.append((nr, nc))
                pushes += 1
    return pushes

print(bfs_count_pushes(10), "pushes for only", 10 * 10, "cells")
```

Marking a cell when you pop it lets it be queued many times by different neighbors. On big grids that multiplies the work. Mark when you push.

## Quiz

### Why does BFS find the shortest path in an unweighted graph?
- [ ] It tries every path
- [x] It reaches nodes in order of increasing distance from the start
- [ ] It uses a stack
Why: The queue processes all nodes at distance d before any at distance d + 1.

### Kahn's algorithm ends with fewer nodes in the order than tasks. What does that mean?
- [ ] The graph is disconnected
- [x] There's a cycle
- [ ] A task has no prerequisites
Why: Nodes in a cycle never reach in-degree 0, so they're never taken.

## Exercise: rotting-oranges | Rotting oranges
In a grid, `0` is empty, `1` a fresh orange and `2` a rotten one. Each minute, fresh oranges next to (up, down, left, right) a rotten one become rotten. Write `minutes_to_rot(grid)` that returns the minutes until no fresh orange is left, or -1 if some never rot. Use **multi-source BFS**: start the queue with every rotten orange at once.

```python starter
from collections import deque


def minutes_to_rot(grid):
    # TODO: queue all rotten oranges, count fresh ones, BFS minute by minute
    pass
```

```python checks
check("example", lambda: minutes_to_rot([[2, 1, 1], [1, 1, 0], [0, 1, 1]]), 4)
check("unreachable", lambda: minutes_to_rot([[2, 1, 1], [0, 1, 1], [1, 0, 1]]), -1)
check("nothing fresh", lambda: minutes_to_rot([[0, 2]]), 0)
check("two sources", lambda: minutes_to_rot([[2, 1, 1, 1, 2]]), 2)
check("big grid", lambda: minutes_to_rot([[2] + [1] * 299] * 300), 299)
```

## Ladder
- easy: Flood Fill
- easy: Find if Path Exists in Graph
- medium: Number of Islands
- medium: Rotting Oranges
- medium: Course Schedule
- medium: Pacific Atlantic Water Flow
- medium: Network Delay Time
- hard: Word Ladder
- hard: Longest Increasing Path in a Matrix
