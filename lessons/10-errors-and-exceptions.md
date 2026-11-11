---
id: errors-and-exceptions
unit: 1
title: Errors and exceptions
minutes: 20
summary: Errors are objects you can catch, inspect and raise. Reading a traceback well, and catching only what you expect, saves hours of debugging.
---

## Reading a traceback

When code raises, Python prints a traceback: the chain of calls, most recent **last**, then the error type and message. Start at the bottom line, then look up to find the line in *your* code.

```python
def average(nums):
    return sum(nums) / len(nums)

try:
    average([])
except ZeroDivisionError as e:
    print(type(e).__name__, "-", e)
```

The common ones: `IndexError` (index past the end), `KeyError` (missing dict key), `TypeError` (wrong kind of value), `ValueError` (right type, bad value, like `int("abc")`), `AttributeError` (no such attribute, often on `None`) and `ZeroDivisionError`.

## try, except, else, finally

Put only the risky line in `try`. `except` handles specific errors. `else` runs if nothing was raised, and `finally` always runs, which is useful for cleanup.

```python
def parse_number(text):
    try:
        value = int(text)
    except ValueError:
        return None
    else:
        return value * 2
    finally:
        print("checked", repr(text))

print(parse_number("21"))
print(parse_number("abc"))
```

## Raising your own errors

`raise` stops the function and reports a problem to the caller. Raise the most specific built-in type that fits, or define your own by subclassing `Exception`.

```python
class InsufficientFunds(Exception):
    pass

def withdraw(balance, amount):
    if amount <= 0:
        raise ValueError(f"amount must be positive, got {amount}")
    if amount > balance:
        raise InsufficientFunds(f"need {amount - balance} more")
    return balance - amount

for amount in [30, -5, 500]:
    try:
        print("left:", withdraw(100, amount))
    except (ValueError, InsufficientFunds) as e:
        print(type(e).__name__, e)
```

## Ask forgiveness or look before you leap?

Python often prefers **EAFP** ("easier to ask forgiveness than permission"): try the operation and handle the failure. The alternative, **LBYL** ("look before you leap"), checks first. Both are fine; EAFP avoids checking twice and race conditions with files.

```python
config = {"port": "8080"}

# Look before you leap
port = int(config["port"]) if "port" in config else 80

# Ask forgiveness
try:
    host = config["host"]
except KeyError:
    host = "localhost"

print(port, host)
```

For dicts specifically, `config.get("host", "localhost")` is simplest of all.

## Compare: Common errors and what they usually mean

| Error | Usually means | First thing to check |
|---|---|---|
| `IndexError` | Index past the end of a list or string | Loop bounds, empty input, `i + 1` at the last item |
| `KeyError` | A dict key that isn't there | Use `.get`, `defaultdict` or `in` |
| `TypeError` | Wrong kind of value, or wrong number of arguments | `None` where you expected a value; missing `self` |
| `AttributeError` | Attribute missing, often on `None` | A function that forgot to `return` |
| `RecursionError` | Recursion too deep | A missing base case, or a very deep input |

## Pitfall: A bare except hides real bugs

```python
def risky(data):
    try:
        return data["value"] / data["count"]
    except:
        return 0

print(risky({"value": 10, "cont": 2}))
```

The typo `"cont"` raises a KeyError, but the bare `except` swallows it and returns 0 as if all was well. Catch only the error you expect, here `ZeroDivisionError`, so real bugs still surface.

## Pitfall: AttributeError on None

```python
def find_user(users, name):
    for u in users:
        if u["name"] == name:
            return u

user = find_user([{"name": "ana"}], "bo")
try:
    print(user.get("name"))
except AttributeError as e:
    print("AttributeError:", e)
```

A function that ends without `return` returns `None`. Check for `None` (`if user is None:`) before using the result.

## Quiz

### Where in a traceback is the actual error message?
- [ ] The first line
- [x] The last line
- [ ] It isn't shown
Why: Tracebacks list calls oldest first; the error type and message come last.

### `int("3.5")` raises which error?
- [ ] TypeError
- [x] ValueError
- [ ] KeyError
Why: The argument is a string, the right type, but its value can't be parsed as an int.

### When does a `finally` block run?
- [ ] Only if there was an error
- [ ] Only if there was no error
- [x] Always
Why: `finally` is for cleanup that must happen either way.

## Exercise: safe-average | Average with clear errors
Write `average(values)` that returns the mean of a list of numbers. Raise `ValueError("no values")` for an empty list, and `TypeError("not a number: ...")` (with the offending value's repr) if any item is not an `int` or `float`. Remember `bool` is a subclass of `int`: reject `True` and `False` too.

```python starter
def average(values):
    # TODO: validate, then compute
    pass
```

```python checks
check("basic", lambda: average([1, 2, 3, 4]), 2.5)
def err(f):
    try:
        f()
    except Exception as e:
        return (type(e).__name__, str(e))
    return None
check("empty", lambda: err(lambda: average([])), ("ValueError", "no values"))
check("bad item", lambda: err(lambda: average([1, "2"])), ("TypeError", "not a number: '2'"))
check("bool rejected", lambda: err(lambda: average([1, True])), ("TypeError", "not a number: True"))
check("floats", lambda: average([0.5, 1.5]), 1.0)
```

## Exercise: parse-config | Parse lines safely
Write `parse_pairs(lines)` that turns lines like `"port=8080"` into a dict `{"port": 8080}`. Values that are whole numbers become ints and everything else stays a string. Skip blank lines and lines starting with `#`. Ignore lines without `=` instead of crashing. Use `try`/`except ValueError` for the int conversion.

```python starter
def parse_pairs(lines):
    # TODO: split on the first "=", strip spaces, try int()
    pass
```

```python checks
check("basic", lambda: parse_pairs(["port=8080", "host = localhost"]), {"port": 8080, "host": "localhost"})
check("comments and blanks", lambda: parse_pairs(["# comment", "", "debug=true"]), {"debug": "true"})
check("no equals sign", lambda: parse_pairs(["oops", "x=1"]), {"x": 1})
check("equals in value", lambda: parse_pairs(["url=a=b"]), {"url": "a=b"})
check("negative number", lambda: parse_pairs(["offset=-3"]), {"offset": -3})
```
