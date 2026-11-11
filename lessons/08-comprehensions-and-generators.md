---
id: comprehensions-and-generators
unit: 1
title: Comprehensions and generators
minutes: 25
summary: Comprehensions build lists, dicts and sets in one readable line. Generators produce values one at a time instead of all at once, which saves memory and lets you stop early.
---

## List comprehensions

`[expression for item in iterable if condition]` reads like a sentence: "the square of x, for each x in nums, if x is even". It's usually clearer and faster than a loop that appends.

```python
nums = [1, 2, 3, 4, 5, 6]
squares = [x * x for x in nums]
even_squares = [x * x for x in nums if x % 2 == 0]
labels = ["even" if x % 2 == 0 else "odd" for x in nums[:3]]
print(squares)
print(even_squares)
print(labels)
```

An `if` at the **end** filters items out. An `a if cond else b` at the **front** picks a value for every item.

## Dict and set comprehensions

The same syntax with braces builds a set, or a dict when you write `key: value`.

```python
words = ["apple", "bob", "kayak", "tree"]
lengths = {w: len(w) for w in words}
palindromes = {w for w in words if w == w[::-1]}
index_of = {w: i for i, w in enumerate(words)}
print(lengths)
print(sorted(palindromes))
print(index_of["kayak"])
```

## Nested comprehensions

Several `for` clauses run in the same order as nested loops: the first `for` is the outer loop.

```python
grid = [[1, 2, 3], [4, 5, 6]]
flat = [x for row in grid for x in row]
transposed = [[row[c] for row in grid] for c in range(3)]
pairs = [(a, b) for a in range(3) for b in range(a + 1, 3)]
print(flat)
print(transposed)
print(pairs)
```

## Generator expressions are lazy

Parentheses instead of brackets make a **generator**: it produces items only when asked. Feeding one to `sum`, `any`, `all`, `max` or `min` avoids building a whole list, and `any`/`all` stop as soon as they know the answer.

```python
nums = range(1, 10_000_001)
print(sum(x * x for x in nums if x % 3 == 0))
print(any(x > 5 for x in [1, 7, 2]))
print(all(len(w) > 2 for w in ["cat", "ox"]))
gen = (x * 2 for x in [1, 2, 3])
print(next(gen), next(gen), list(gen))
```

A generator can be used up only once: after `list(gen)` took the last item, it's empty.

## Writing your own generator with yield

A function that uses `yield` returns a generator. Each `yield` hands out one value and pauses the function until the next value is requested.

```python
def fib():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

def take(n, it):
    return [x for _, x in zip(range(n), it)]

print(take(10, fib()))
```

This generator is infinite, but that's fine: it only computes the values someone asks for.

## Compare: List comprehension or generator?

| | `[... for ...]` list | `(... for ...)` generator |
|---|---|---|
| Builds | Every item right now | One item at a time, on demand |
| Memory | Proportional to the count | Constant |
| Reuse | Loop over it as often as you like | Only once |
| Indexing, `len` | Yes | No |
| Best for | Results you keep or reuse | Feeding `sum`, `any`, `all`, `max`, or huge/infinite data |

## Pitfall: Reusing an exhausted generator

```python
squares = (x * x for x in range(4))
print(sum(squares))
print(sum(squares))
```

The second `sum` sees an empty generator. If you need the values twice, build a list.

## Pitfall: Comprehensions that are too clever

```python
data = [[1, -2], [3, 4], [-5, 6]]
result = [y for x in data if sum(x) > 0 for y in x if y > 0]
print(result)
```

It works, but nobody can read it at a glance. When a comprehension needs more than one `for` and an `if`, a plain loop is usually kinder to the next reader, including future you.

## Quiz

### What does `[x for x in range(6) if x % 2]` give?
- [x] `[1, 3, 5]`
- [ ] `[0, 2, 4]`
- [ ] `[True, False, ...]`
Why: The trailing `if` keeps items where `x % 2` is truthy, which means odd numbers.

### Why prefer `sum(x for x in nums)` over `sum([x for x in nums])` for huge inputs?
- [ ] It gives a different answer
- [x] It doesn't build a whole list in memory first
- [ ] Lists can't be summed
Why: The generator feeds `sum` one value at a time, so memory stays constant.

### In `[a + b for a in "xy" for b in "12"]`, which loop is the outer one?
- [x] `for a in "xy"`
- [ ] `for b in "12"`
Why: Clauses nest left to right, so the result is `["x1", "x2", "y1", "y2"]`.

## Exercise: word-lengths | Comprehension practice
Write three one-line functions using comprehensions:
`long_words(words, n)` returns the words longer than `n`, in order.
`first_letters(words)` returns a dict mapping each word to its first letter, skipping empty strings.
`vowel_set(text)` returns the set of vowels (`aeiou`) that appear in `text`, ignoring case.

```python starter
def long_words(words, n):
    # TODO: a list comprehension with a filter
    pass


def first_letters(words):
    # TODO: a dict comprehension with a filter
    pass


def vowel_set(text):
    # TODO: a set comprehension
    pass
```

```python checks
check("long words", lambda: long_words(["a", "tree", "is", "green"], 2), ["tree", "green"])
check("first letters", lambda: first_letters(["ana", "", "bo"]), {"ana": "a", "bo": "b"})
check("vowels", lambda: vowel_set("Python Is Fun"), {"o", "i", "u"})
check("no vowels", lambda: vowel_set("rhythm"), set())
```

## Exercise: chunks-generator | Chunks with yield
Write a generator `chunks(items, size)` that yields consecutive slices of `items` of length `size` (the last one may be shorter). Then write `first_square_over(limit)` that returns the first perfect square greater than `limit`, using a generator and `next()` instead of a list.

```python starter
def chunks(items, size):
    # TODO: yield one slice at a time
    pass


def first_square_over(limit):
    # TODO: next(...) over a generator of squares
    pass
```

```python checks
check("chunks", lambda: list(chunks([1, 2, 3, 4, 5], 2)), [[1, 2], [3, 4], [5]])
check("exact chunks", lambda: list(chunks("abcdef", 3)), ["abc", "def"])
check("is a generator", lambda: hasattr(chunks([1], 1), "__next__"), True)
check("first square", lambda: first_square_over(50), 64)
check("huge limit", lambda: first_square_over(10 ** 12), (10 ** 6 + 1) ** 2)
```
