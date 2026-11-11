---
id: names-and-objects
unit: 1
title: Names, objects and types
minutes: 25
summary: In Python, a variable is a name tag stuck on an object, not a box that holds a value. Once that clicks, half of the confusing bugs stop being confusing.
---

## Names are tags, not boxes

When you write `a = [1, 2, 3]`, Python creates a list object somewhere in memory and sticks the name `a` on it. `b = a` does not copy the list: it sticks a second tag on the **same** object.

Predict what this prints before you run it.

```python
a = [1, 2, 3]
b = a
b.append(4)
print(a)
print(a is b)
```

`a` changed even though you only touched `b`, because there is only one list. `is` asks "are these the same object?" This one idea explains aliasing bugs, why default arguments misbehave, and why `[[0] * 3] * 3` is a trap (you'll meet it soon).

## Mutable and immutable

Some objects can change after they're created (**mutable**): lists, dicts, sets. Others can't (**immutable**): int, float, str, tuple, bool, None. "Changing" an immutable object really builds a new object and moves the tag.

```python
s = "cat"
t = s
s = s + "s"
print(s, t)

nums = [1, 2]
same = nums
nums += [3]
print(nums, same)
```

The string `t` still says `cat`: `s + "s"` made a new string and moved only the `s` tag. The list `same` changed, because `+=` on a list modifies the list in place.

## == compares values, is compares identity

Use `==` to ask "do these look equal?" and `is` only for "is this the very same object?". The one place you'll use `is` every day is checking for `None`.

```python
x = [1, 2]
y = [1, 2]
print(x == y)
print(x is y)

result = None
print(result is None)
```

## Every value has a type

`type()` tells you an object's type and `isinstance()` checks it. Python is dynamically typed: names don't have types, objects do, so the same name can point at an int now and a string later.

```python
for value in [42, 3.5, "hi", True, None, [1], (1,), {"a": 1}, {1}]:
    print(type(value).__name__, isinstance(value, (int, float)))
```

Notice that `True` counts as an int: `bool` is a subclass of `int`, so `True + True == 2`.

## Numbers you'll meet in LeetCode

Python ints never overflow, so factorials and big products just work. Floats are binary approximations, so never compare them with `==`. `//` is floor division and `%` is remainder, and with negative numbers both round toward negative infinity, unlike C++ and Java.

```python
print(2 ** 100)
print(0.1 + 0.2 == 0.3, abs((0.1 + 0.2) - 0.3) < 1e-9)
print(7 // 2, -7 // 2, 7 % 3, -7 % 3)
print(int(-7 / 2))
print(float("inf") > 10 ** 100)
```

`int(-7 / 2)` truncates toward zero, which is what C++ and Java division does. When a problem says "truncate toward zero", that's the one you want.

## Compare: == versus is

| | `==` | `is` |
|---|---|---|
| Question it asks | Do the values match? | Is it the same object? |
| Calls | `__eq__`, which classes can customize | Nothing; compares identity |
| Use it for | Comparing data | `x is None`, `x is not None` |
| Danger | Slow for huge structures | `a is b` on numbers or strings "works" by accident sometimes |

## Pitfall: Copying a list by assignment

```python
original = [3, 1, 2]
backup = original
original.sort()
print(backup)
```

`backup` was never a copy. To copy a list, use `original[:]`, `list(original)` or `original.copy()`. Those are **shallow** copies: a list of lists still shares the inner lists, and `copy.deepcopy` copies all the way down.

## Pitfall: Using is to compare numbers

```python
a = 1000
b = int("1000")
print(a == b, a is b)
```

They're equal but not the same object. Small integers are cached, so `is` sometimes *seems* to work in tests and then fails on real data. Always use `==` for values.

## Quiz

### After `a = [1]; b = a; b = b + [2]`, what is `a`?
- [x] `[1]`
- [ ] `[1, 2]`
- [ ] An error
Why: `b + [2]` builds a new list and moves the `b` tag to it. Only `b += [2]` (in place) would have changed `a` too.

### Which of these is mutable?
- [ ] `"hello"`
- [ ] `(1, 2)`
- [x] `{"a": 1}`
- [ ] `42`
Why: Dicts, lists and sets can change in place. Strings, tuples and numbers can't.

### What is `-7 // 2` in Python?
- [ ] `-3`
- [x] `-4`
- [ ] `-3.5`
Why: `//` floors toward negative infinity. Use `int(-7 / 2)` when a problem wants truncation toward zero (-3).

## Exercise: same-or-copy | Same object or a copy?
Write `describe(a, b)` that returns `"same object"` if `a` and `b` are the very same object, `"equal copy"` if they are different objects with equal values, and `"different"` otherwise.

Then write `safe_copy(grid)` that returns a copy of a list of lists where changing the copy never changes the original, without importing anything.

```python starter
def describe(a, b):
    # TODO: decide between "same object", "equal copy" and "different"
    pass


def safe_copy(grid):
    # TODO: copy the outer list AND each inner list
    pass
```

```python checks
x = [1, 2]
check("same object", lambda: describe(x, x), "same object")
check("equal copy", lambda: describe(x, [1, 2]), "equal copy")
check("different", lambda: describe(x, [2, 1]), "different")
g = [[1, 2], [3, 4]]
c = safe_copy(g)
check("copy is equal", lambda: c, [[1, 2], [3, 4]])
check("copy is a new object", lambda: c is not g, True)
check("inner lists are new too", lambda: c is not None and c[0] is not g[0], True)
```

## Exercise: python-division | Division like C++
Some problems (like evaluating arithmetic expressions) expect C++-style integer division, which truncates toward zero. Write `cpp_div(a, b)` that returns `a / b` truncated toward zero as an int, and `cpp_mod(a, b)` that returns the matching remainder, so that `cpp_div(a, b) * b + cpp_mod(a, b) == a`.

```python starter
def cpp_div(a, b):
    # TODO: truncate toward zero, unlike Python's //
    pass


def cpp_mod(a, b):
    # TODO: the remainder that goes with cpp_div
    pass
```

```python checks
check("7 / 2", lambda: cpp_div(7, 2), 3)
check("-7 / 2", lambda: cpp_div(-7, 2), -3)
check("7 / -2", lambda: cpp_div(7, -2), -3)
check("-7 % 2", lambda: cpp_mod(-7, 2), -1)
check("identity holds", lambda: all(cpp_div(a, b) * b + cpp_mod(a, b) == a for a in range(-20, 21) for b in (-7, -3, 3, 7)), True)
check("big numbers stay exact", lambda: cpp_div(-(10 ** 20) - 1, 10), -(10 ** 19))
```
