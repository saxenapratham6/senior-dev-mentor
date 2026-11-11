---
id: trees
unit: 3
title: Binary trees, DFS and BFS
minutes: 40
summary: Most tree problems are one recursive question, what should this node return, given what its children return? Depth-first search answers it with recursion, and breadth-first search walks level by level with a queue.
---

## Signals
- You're given a `TreeNode` root
- Height, depth, diameter, a path sum, "balanced"
- Anything "per level": level order, right side view, zigzag
- Binary search tree (BST): in-order traversal gives sorted values
- Lowest common ancestor, or validating a structure

## Building trees to experiment with

LeetCode shows trees as lists in level order, with `None` for missing children. This helper builds one so you can test your functions.

```python
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right

def build(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q, i = deque([root]), 1
    while q and i < len(values):
        node = q.popleft()
        for side in ("left", "right"):
            if i < len(values) and values[i] is not None:
                child = TreeNode(values[i])
                setattr(node, side, child)
                q.append(child)
            i += 1
    return root

root = build([3, 9, 20, None, None, 15, 7])
print(root.val, root.left.val, root.right.val, root.right.left.val)
```

## DFS: what does each node return?

Think recursively: assume the calls on `left` and `right` already returned correct answers. What should this node return? Handle `None` as the base case.

```python
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right

def tree_sum(node):
    if node is None:
        return 0
    return node.val + tree_sum(node.left) + tree_sum(node.right)

def count_leaves(node):
    if node is None:
        return 0
    if node.left is None and node.right is None:
        return 1
    return count_leaves(node.left) + count_leaves(node.right)

root = TreeNode(1, TreeNode(2, TreeNode(4), TreeNode(5)), TreeNode(3))
print(tree_sum(root), count_leaves(root))
```

## DFS that also carries information down

Some answers need information from above, such as the path so far or the allowed range of values. Pass it as an argument.

```python
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right

def root_to_leaf_paths(node, path=()):
    if node is None:
        return []
    path = path + (node.val,)
    if node.left is None and node.right is None:
        return [path]
    return root_to_leaf_paths(node.left, path) + root_to_leaf_paths(node.right, path)

root = TreeNode(1, TreeNode(2, None, TreeNode(5)), TreeNode(3))
print(root_to_leaf_paths(root))
```

Passing a tuple and building a new one per call means each branch has its own path; nothing needs undoing.

## BFS: level by level

A queue processes nodes in the order they were discovered. Taking exactly `len(q)` nodes at a time handles one level per round.

```python
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right

def level_averages(root):
    out, q = [], deque([root] if root else [])
    while q:
        level = [q.popleft() for _ in range(len(q))]
        out.append(sum(n.val for n in level) / len(level))
        for n in level:
            q.extend(child for child in (n.left, n.right) if child)
    return out

root = TreeNode(3, TreeNode(9), TreeNode(20, TreeNode(15), TreeNode(7)))
print(level_averages(root))
```

## Compare: DFS or BFS?

| | DFS (recursion or a stack) | BFS (a queue) |
|---|---|---|
| Visits | One branch to the bottom, then backtracks | Level by level |
| Natural for | Heights, path sums, subtree answers, validation | Per-level answers, shortest number of steps |
| Memory | O(height) | O(width of the widest level) |
| Risk | Recursion limit on very deep (skewed) trees | None special |

## Pitfall: Checking only immediate children for a BST

```python
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right

def looks_like_bst(node):
    if node is None:
        return True
    if node.left and node.left.val >= node.val:
        return False
    if node.right and node.right.val <= node.val:
        return False
    return looks_like_bst(node.left) and looks_like_bst(node.right)

root = TreeNode(5, TreeNode(3, None, TreeNode(8)), TreeNode(9))
print(looks_like_bst(root), "but 8 sits in the left subtree of 5")
```

Every node in the left subtree must be smaller than the root, not just the left child. Pass the allowed `(low, high)` range down the recursion.

## Quiz

### What's the base case for most recursive tree functions?
- [x] `node is None`
- [ ] The root
- [ ] A node with two children
Why: Empty subtrees are where the recursion stops, and they usually have a simple answer like 0, True or an empty list.

### Which traversal of a BST visits values in sorted order?
- [ ] Pre-order (node, left, right)
- [x] In-order (left, node, right)
- [ ] Post-order (left, right, node)
- [ ] Level order
Why: Everything left of a node is smaller and everything right is larger, so left-node-right comes out sorted.

## Exercise: diameter-tree | Diameter of a binary tree
The diameter is the number of **edges** on the longest path between any two nodes, which may or may not pass through the root. Write `diameter(root)` with one DFS: a helper returns each subtree's height, and as a side effect updates the best `left_height + right_height` seen. The `TreeNode` class and a `build` helper are provided.

```python starter
from collections import deque


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right


def build(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q, i = deque([root]), 1
    while q and i < len(values):
        node = q.popleft()
        for side in ("left", "right"):
            if i < len(values) and values[i] is not None:
                child = TreeNode(values[i])
                setattr(node, side, child)
                q.append(child)
            i += 1
    return root


def diameter(root):
    # TODO: height(node) helper that also updates the best diameter
    pass
```

```python checks
check("example", lambda: diameter(build([1, 2, 3, 4, 5])), 3)
check("two nodes", lambda: diameter(build([1, 2])), 1)
check("single", lambda: diameter(build([1])), 0)
check("empty", lambda: diameter(build([])), 0)
check("not through root", lambda: diameter(build([1, 2, None, 3, 4, 5, None, None, 6, 7, None, None, 8])), 6)
```

## Ladder
- easy: Maximum Depth of Binary Tree
- easy: Invert Binary Tree
- easy: Same Tree
- medium: Binary Tree Level Order Traversal
- medium: Validate Binary Search Tree
- medium: Kth Smallest Element in a BST
- medium: Lowest Common Ancestor of a Binary Tree
- medium: Construct Binary Tree from Preorder and Inorder Traversal
- hard: Binary Tree Maximum Path Sum
- hard: Serialize and Deserialize Binary Tree
