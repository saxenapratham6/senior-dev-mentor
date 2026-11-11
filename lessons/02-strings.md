---
id: strings
unit: 1
title: Strings
minutes: 25
summary: Strings are immutable sequences of characters. Indexing, slicing and a handful of methods solve most string problems, but building strings the wrong way can quietly make your code slow.
---

## Indexing and slicing

A string is a sequence, so you can index it from the front (`s[0]`) or the back (`s[-1]`). A slice `s[start:stop:step]` includes `start` but stops *before* `stop`, and any part can be left out.

```python
s = "python"
print(s[0], s[-1], s[1:4])
print(s[:2], s[2:], s[::2])
print(s[::-1])
print(s[10:20] == "")
```

Out-of-range *slices* never raise: they just come back shorter or empty. Out-of-range *indexes* like `s[10]` do raise an IndexError. `s[::-1]` reverses any sequence and is the fastest way to check a palindrome.

## Strings can't change

You can't assign `s[0] = "P"`. Every "change" builds a new string. That's why building a long string with `+=` in a loop can cost O(n²): each step may copy everything built so far. Collect pieces in a list and `"".join()` them once.

```python
words = ["make", "it", "fast"]
sentence = " ".join(words)
print(sentence)

chars = list("hello")
chars[0] = "j"
print("".join(chars))
```

To "edit" a string, turn it into a list of characters, change the list, and join it back.

## Methods you'll use constantly

```python
s = "  Hello, World!  "
print(s.strip().lower())
print("a,b,,c".split(","))
print("one  two   three".split())
print("racecar".count("r"), "banana".find("na"), "banana".find("xyz"))
print("Ab3_".isalnum(), "abc".isalpha(), "123".isdigit())
print("hello".replace("l", "L"), "hello".startswith("he"))
```

`split()` with no argument splits on any run of whitespace and drops empty pieces. `find` returns -1 when there's no match, while `index` raises.

## Characters are numbers underneath

`ord(c)` gives a character's code point and `chr(n)` goes back. Many LeetCode problems count lowercase letters with a list of 26, using `ord(c) - ord("a")` as the index.

```python
print(ord("a"), ord("z"), chr(98))
counts = [0] * 26
for c in "banana":
    counts[ord(c) - ord("a")] += 1
print(counts[:3])
```

## f-strings for output

f-strings put expressions straight into text, with optional formatting after a colon.

```python
name, score, ratio = "Ada", 42, 2 / 3
print(f"{name} scored {score} ({ratio:.2%})")
print(f"{score:>5}|{score:<5}|{score:05}")
print(f"{name=}")
```

## Compare: Ways to build a string

| | `s += piece` in a loop | `"".join(pieces)` | f-string |
|---|---|---|---|
| Best for | A few small pieces | Many pieces in a loop | Mixing text and values |
| Cost for n pieces | Can be O(n²) | O(total length) | One string |
| Reads like | Simple | One clear step at the end | A template |

## Pitfall: Trying to change a character

```python
s = "cat"
s[0] = "b"
```

Strings are immutable. Build a new one: `"b" + s[1:]`, or use a list of characters and `"".join()`.

## Pitfall: Comparing strings that look like numbers

```python
print("10" < "9")
print(sorted(["10", "9", "100"]))
print(sorted(["10", "9", "100"], key=int))
```

Strings compare character by character, so `"10" < "9"` because `"1" < "9"`. Convert with `int` (or sort with `key=int`) when you mean numbers.

## Quiz

### What does `"hello"[1:4]` give?
- [ ] `"hell"`
- [x] `"ell"`
- [ ] `"ello"`
Why: Slices include the start index (1) and stop before the end index (4), so you get indexes 1, 2 and 3.

### Why is `"".join(parts)` preferred over `+=` in a long loop?
- [ ] `+=` doesn't work on strings
- [x] Each `+=` can copy the whole string built so far
- [ ] `join` sorts the parts
Why: Strings are immutable, so repeated `+=` may copy everything each time, which adds up to O(n²). `join` sizes the result once.

### What is `"a-b--c".split("-")`?
- [ ] `["a", "b", "c"]`
- [x] `["a", "b", "", "c"]`
- [ ] `["a-b", "c"]`
Why: With an explicit separator, two separators in a row produce an empty string between them. Only `split()` with no argument drops empties.

## Exercise: clean-palindrome | Palindrome, ignoring punctuation
Write `is_clean_palindrome(s)` that returns True if `s` reads the same forwards and backwards when you ignore case and keep only letters and digits. An empty string counts as a palindrome.

```python starter
def is_clean_palindrome(s):
    # TODO: keep only letters/digits, lowercase them, compare with the reverse
    pass
```

```python checks
check("classic", lambda: is_clean_palindrome("A man, a plan, a canal: Panama"), True)
check("not one", lambda: is_clean_palindrome("race a car"), False)
check("empty", lambda: is_clean_palindrome(""), True)
check("only punctuation", lambda: is_clean_palindrome(".,!"), True)
check("digits count", lambda: is_clean_palindrome("0P"), False)
```

## Exercise: compress | Run-length compression
Write `compress(s)` that turns runs of the same character into the character followed by the run length, like `"aaabcc"` → `"a3b1c2"`. Return the original string if the compressed one isn't shorter. Build the result with a list and `"".join()`.

```python starter
def compress(s):
    # TODO: walk the string, count each run, then join the pieces
    pass
```

```python checks
check("runs", lambda: compress("aaabccddd"), "a3b1c2d3")
check("not shorter", lambda: compress("abc"), "abc")
check("empty", lambda: compress(""), "")
check("one long run", lambda: compress("zzzzzzzzzzzz"), "z12")
check("same length keeps original", lambda: compress("aabb"), "aabb")
```
