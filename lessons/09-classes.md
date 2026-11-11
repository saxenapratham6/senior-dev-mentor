---
id: classes
unit: 1
title: Classes and objects
minutes: 30
summary: A class bundles data with the functions that work on it. LeetCode hands you classes like ListNode and TreeNode, and design problems ask you to write your own, so you need to read and write them comfortably.
---

## Defining a class

`__init__` runs when you create an object and sets up its attributes. `self` is the object itself, passed in automatically. Methods are functions that take `self` first.

```python
class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("deposit must be positive")
        self.balance += amount
        return self.balance

acct = BankAccount("ana")
acct.deposit(50)
print(acct.owner, acct.balance)
```

## Readable objects with __repr__ and __eq__

Without `__repr__`, printing an object shows a memory address. Without `__eq__`, `==` falls back to `is`. These "dunder" (double underscore) methods let your class work with Python's built-in operations.

```python
class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __repr__(self):
        return f"Point({self.x}, {self.y})"

    def __eq__(self, other):
        return (self.x, self.y) == (other.x, other.y)

    def __hash__(self):
        return hash((self.x, self.y))

p, q = Point(1, 2), Point(1, 2)
print(p, p == q, p is q)
print(len({p, q}))
```

If you define `__eq__`, also define `__hash__` (from the same fields) so objects can go in sets and dict keys.

## The classes LeetCode gives you

Linked list and tree problems hand you a node class. Each node holds a value and references to other nodes. Building a few by hand makes these problems much less mysterious.

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

head = ListNode(1, ListNode(2, ListNode(3)))
node, values = head, []
while node:
    values.append(node.val)
    node = node.next
print(values)

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right

root = TreeNode(2, TreeNode(1), TreeNode(3))
print(root.left.val, root.val, root.right.val)
```

## dataclasses write the boilerplate for you

`@dataclass` generates `__init__`, `__repr__` and `__eq__` from type-annotated fields. `order=True` adds comparisons, and `frozen=True` makes instances immutable and hashable.

```python
from dataclasses import dataclass, field

@dataclass(order=True, frozen=True)
class Task:
    priority: int
    name: str = field(compare=False)

tasks = [Task(3, "deploy"), Task(1, "fix bug"), Task(2, "review")]
print(sorted(tasks)[0])
print(Task(1, "a") == Task(1, "b"))
```

`field(compare=False)` leaves `name` out of comparisons, so tasks sort only by priority.

## Inheritance and composition

A subclass reuses and extends a parent class; `super()` calls the parent's version. Often, though, it's simpler to **compose**: give an object another object as an attribute.

```python
class Shape:
    def area(self):
        raise NotImplementedError

    def describe(self):
        return f"{type(self).__name__} with area {self.area():.1f}"

class Circle(Shape):
    def __init__(self, r):
        self.r = r

    def area(self):
        return 3.14159 * self.r ** 2

class Square(Shape):
    def __init__(self, side):
        self.side = side

    def area(self):
        return self.side ** 2

for s in [Circle(1), Square(3)]:
    print(s.describe())
```

## Compare: Plain class, dataclass or tuple?

| | Plain class | `@dataclass` | tuple / namedtuple |
|---|---|---|---|
| Boilerplate | Write it all | Generated | None |
| Can change | Yes | Yes, unless `frozen=True` | No |
| Methods with behavior | Yes | Yes | Not really |
| Best for | Objects with real behavior (LRU cache, iterator) | Records with a few methods | Small fixed records, dict keys, heap entries |

## Pitfall: A class-level list shared by every object

```python
class Team:
    members = []

    def add(self, name):
        self.members.append(name)

a, b = Team(), Team()
a.add("ana")
print(b.members)
```

`members` belongs to the class, so every Team shares one list. Create per-object data in `__init__`: `self.members = []`.

## Pitfall: Forgetting self

```python
class Counter:
    def __init__(self):
        self.count = 0

    def bump():
        self.count += 1

try:
    Counter().bump()
except TypeError as e:
    print("TypeError:", e)
```

Python passes the object as the first argument, so every method needs a `self` parameter.

## Quiz

### What does `self` refer to inside a method?
- [ ] The class
- [x] The object the method was called on
- [ ] The parent class
Why: `obj.method()` is really `Class.method(obj)`, so `self` is `obj`.

### You defined `__eq__` on a class. What else should you define so objects work in a set?
- [ ] `__repr__`
- [x] `__hash__`
- [ ] `__lt__`
Why: Sets use the hash to find candidates and `__eq__` to confirm. Equal objects must have equal hashes.

### Which creates a separate list for each object?
- [ ] `items = []` in the class body
- [x] `self.items = []` in `__init__`
Why: Class-body attributes are shared by all instances; `__init__` runs once per object.

## Exercise: min-stack | A stack that knows its minimum
Write a `MinStack` class with `push(x)`, `pop()` (returns the removed value), `top()` and `get_min()`, where **every** method is O(1). Hint: store, along with each value, the minimum at the time it was pushed.

```python starter
class MinStack:
    def __init__(self):
        # TODO: what do you need to remember?
        pass

    def push(self, x):
        pass

    def pop(self):
        pass

    def top(self):
        pass

    def get_min(self):
        pass
```

```python checks
def run_ops():
    s = MinStack()
    s.push(5)
    s.push(2)
    s.push(8)
    out = [s.get_min(), s.top(), s.pop(), s.get_min(), s.pop(), s.get_min()]
    s.push(1)
    out.append(s.get_min())
    return out
check("operations", run_ops, [2, 8, 8, 2, 2, 5, 1])
def duplicates():
    s = MinStack()
    for x in [3, 3, 1, 1]:
        s.push(x)
    s.pop()
    return s.get_min()
check("duplicate minimums", duplicates, 1)
def many():
    s = MinStack()
    for x in range(100000, 0, -1):
        s.push(x)
    return s.get_min()
check("many pushes", many, 1)
```

## Exercise: vector-class | A 2D vector
Write a `Vector` class with `x` and `y`, where `Vector(1, 2) + Vector(3, 4)` gives `Vector(4, 6)`, `v * 3` scales it, `==` compares values, `repr` looks like `Vector(1, 2)`, and `abs(v)` returns its length. Look up the dunder methods `__add__`, `__mul__` and `__abs__`.

```python starter
class Vector:
    def __init__(self, x, y):
        # TODO
        pass
```

```python checks
check("add", lambda: Vector(1, 2) + Vector(3, 4) == Vector(4, 6), True)
check("scale", lambda: Vector(1, -2) * 3 == Vector(3, -6), True)
check("repr", lambda: repr(Vector(1, 2)), "Vector(1, 2)")
check("length", lambda: abs(Vector(3, 4)), 5.0)
check("not equal", lambda: Vector(1, 2) == Vector(2, 1), False)
```
