---
id: functions-and-scope
unit: 1
title: Functions and scope
minutes: 30
summary: Functions are objects you can pass around, and Python finds names by looking inside out. Nested helper functions, which show up in every DFS and backtracking solution, depend on getting scope right.
---

## Parameters, defaults and keyword arguments

Arguments can be passed by position or by name. Defaults make parameters optional. Returning several values really returns one tuple.

```python
def describe(name, age=18, *, city="Urbana"):
    return f"{name}, {age}, from {city}"

print(describe("ana"))
print(describe("bo", 21))
print(describe("cy", city="Chicago"))

def stats(nums):
    return min(nums), max(nums), sum(nums) / len(nums)

low, high, mean = stats([2, 4, 9])
print(low, high, mean)
```

Parameters after a bare `*` must be passed by name, which keeps calls readable.

## *args and **kwargs

`*args` collects extra positional arguments into a tuple and `**kwargs` collects extra keyword arguments into a dict. The same stars unpack a list or dict when you call a function.

```python
def total(*args, **kwargs):
    print(args, kwargs)
    return sum(args)

print(total(1, 2, 3, scale=2))
nums = [4, 5]
print(total(*nums))
```

## Scope: where Python looks for a name

Python looks up a name in this order: **L**ocal (inside the current function), **E**nclosing functions, **G**lobal (the module), then **B**uilt-ins. Assigning to a name inside a function makes it local, unless you say `nonlocal` (for an enclosing function) or `global`.

```python
def count_paths(n):
    calls = 0

    def walk(step):
        nonlocal calls
        calls += 1
        if step >= n:
            return 1 if step == n else 0
        return walk(step + 1) + walk(step + 2)

    ways = walk(0)
    return ways, calls

print(count_paths(4))
```

This is exactly the shape of most DFS and backtracking solutions: an outer function sets up state, and a nested helper reads it, or changes it with `nonlocal`.

## Functions are values

You can store functions in variables, pass them to other functions and return them. `lambda` makes a small one-expression function, most often as a `key=` for sorting.

```python
def apply_twice(f, x):
    return f(f(x))

print(apply_twice(lambda v: v * 3, 2))

people = [("ana", 21), ("bo", 19), ("cy", 21)]
print(sorted(people, key=lambda p: (-p[1], p[0])))

ops = {"+": lambda a, b: a + b, "*": lambda a, b: a * b}
print(ops["*"](6, 7))
```

A dict of functions is a clean way to handle operators in calculator problems.

## Closures remember their surroundings

A nested function keeps access to the variables of the function that created it, even after that function returns. That's a closure.

```python
def make_counter():
    count = 0

    def bump():
        nonlocal count
        count += 1
        return count

    return bump

c = make_counter()
c()
c()
print(c())
```

## Compare: Ways to share state with a helper

| Approach | Example | When |
|---|---|---|
| Pass it in and return it | `def walk(i, path): ...` | The cleanest; nothing hidden |
| Read from the enclosing function | `def walk(i): use(grid)` | Read-only data like the grid or graph |
| Mutate an enclosing list/set/dict | `seen.add(x)`, `result.append(x)` | Collecting answers; no `nonlocal` needed |
| `nonlocal x` | `nonlocal best; best = max(best, v)` | Rebinding a number or string in the enclosing function |

## Pitfall: A mutable default argument

```python
def add_item(item, bucket=[]):
    bucket.append(item)
    return bucket

print(add_item("a"))
print(add_item("b"))
```

The default list is created **once**, when the function is defined, and shared by every call. Use `bucket=None` and create the list inside: `if bucket is None: bucket = []`.

## Pitfall: Assigning makes a name local

```python
best = 0

def update(x):
    if x > best:
        best = x

try:
    update(5)
except UnboundLocalError as e:
    print("UnboundLocalError:", e)
```

Because `best` is assigned inside `update`, Python treats it as local everywhere in that function, so reading it first fails. Use `nonlocal` (or `global`), or better, return the new value.

## Pitfall: Lambdas in a loop all see the last value

```python
funcs = [lambda: i for i in range(3)]
print([f() for f in funcs])
fixed = [lambda i=i: i for i in range(3)]
print([f() for f in fixed])
```

Closures look up `i` when they're called, not when they're made, and by then the loop has finished. Binding it as a default argument captures the current value.

## Quiz

### In which order does Python look up a name?
- [ ] Global, Local, Built-in, Enclosing
- [x] Local, Enclosing, Global, Built-in
- [ ] Built-in, Global, Enclosing, Local
Why: LEGB: inside out, ending with built-ins like `len` and `print`.

### Why is `def f(items=[])` dangerous?
- [ ] Lists can't be defaults
- [x] The same list is reused by every call
- [ ] It makes the function slower
Why: Defaults are evaluated once, when `def` runs. Mutating that list carries over into later calls.

### A nested helper needs to increase an integer `count` from its enclosing function. What does it need?
- [ ] `global count`
- [x] `nonlocal count`
- [ ] Nothing
Why: `count += 1` assigns, which would make `count` local. `nonlocal` points it at the enclosing function's variable.

## Exercise: make-multiplier | Function factory
Write `make_multiplier(k)` that returns a function which multiplies its argument by `k`. Then write `compose(f, g)` that returns a function computing `f(g(x))`.

```python starter
def make_multiplier(k):
    # TODO: return a function that remembers k
    pass


def compose(f, g):
    # TODO: return a function of x
    pass
```

```python checks
triple = make_multiplier(3)
check("triple", lambda: triple(5), 15)
check("separate closures", lambda: (make_multiplier(2)(10), make_multiplier(10)(2)), (20, 20))
check("compose order", lambda: compose(lambda x: x + 1, lambda x: x * 2)(5), 11)
check("compose with multiplier", lambda: compose(make_multiplier(2), make_multiplier(5))(1), 10)
```

## Exercise: count-islands-helper | Biggest group with a nested helper
A grid holds `1` for land and `0` for water. Write `largest_area(grid)` that returns the size of the largest group of land cells connected up, down, left or right. Use a nested `dfs(r, c)` helper that reads `grid` and a `seen` set from the enclosing function. Recursion is fine for these small grids.

```python starter
def largest_area(grid):
    # TODO: a seen set, a nested dfs(r, c) that returns the size of one group
    pass
```

```python checks
check("two groups", lambda: largest_area([[1, 1, 0], [0, 1, 0], [0, 0, 1]]), 3)
check("all water", lambda: largest_area([[0, 0], [0, 0]]), 0)
check("all land", lambda: largest_area([[1, 1], [1, 1]]), 4)
check("diagonals don't connect", lambda: largest_area([[1, 0], [0, 1]]), 1)
check("empty grid", lambda: largest_area([]), 0)
```
