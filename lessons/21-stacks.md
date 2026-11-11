---
id: stacks
unit: 3
title: Stacks and monotonic stacks
minutes: 35
summary: A stack remembers what's still open: brackets waiting to close, operands waiting for an operator, or items waiting for something bigger. A monotonic stack finds the next greater or smaller element for every item in one pass.
---

## Signals
- Matching or nesting: brackets, tags, undo, "decode `3[ab]`"
- Evaluate an expression, or process tokens left to right
- "Next greater / smaller element", "how many days until warmer"
- The nearest item to the left or right that is bigger or smaller
- Largest rectangle or area bounded by heights

## A stack for nesting

Push what opens, pop when it closes. If the popped item doesn't match, or the stack isn't empty at the end, the nesting is broken.

```python
def balanced(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in s:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack

print([balanced(s) for s in ["([]{})", "([)]", "((", ""]])
```

## A monotonic stack: next greater element

Keep a stack of indexes whose "next greater" you haven't found yet, with values **decreasing** from bottom to top. A new item pops every smaller item: it is their next greater element. Each index is pushed and popped once: O(n).

```python
def next_greater(nums):
    answer = [-1] * len(nums)
    stack = []
    for i, x in enumerate(nums):
        while stack and nums[stack[-1]] < x:
            j = stack.pop()
            answer[j] = x
        stack.append(i)
        print(f"after {x}: waiting {[nums[k] for k in stack]}")
    return answer

print(next_greater([2, 1, 2, 4, 3]))
```

The stack only ever holds items still waiting for something bigger, which is why it stays decreasing.

## Worked example: evaluating postfix expressions

In postfix (reverse Polish) notation, operators come after their operands: `3 4 + 2 *` means `(3 + 4) * 2`. Numbers are pushed; an operator pops two, applies, and pushes the result.

```python
def eval_postfix(tokens):
    ops = {
        "+": lambda a, b: a + b,
        "-": lambda a, b: a - b,
        "*": lambda a, b: a * b,
        "/": lambda a, b: int(a / b),
    }
    stack = []
    for t in tokens:
        if t in ops:
            b, a = stack.pop(), stack.pop()
            stack.append(ops[t](a, b))
        else:
            stack.append(int(t))
    return stack[0]

print(eval_postfix("3 4 + 2 *".split()))
print(eval_postfix("7 -2 /".split()))
```

Pop order matters: the first pop is the **right** operand. `int(a / b)` truncates toward zero, as many problems require.

## Compare: Increasing or decreasing stack?

| You want, for each item | Keep the stack | Pop while the top is |
|---|---|---|
| Next greater element | Decreasing | Smaller than the new item |
| Next smaller element | Increasing | Larger than the new item |
| Previous greater element | Decreasing | Smaller or equal; the top after popping is the answer |
| Largest rectangle in a histogram | Increasing (of heights) | Taller than the new bar |

## Pitfall: Popping from an empty stack

```python
def balanced(s):
    stack = []
    for ch in s:
        if ch == "(":
            stack.append(ch)
        else:
            stack.pop()
    return not stack

try:
    balanced("())")
except IndexError as e:
    print("IndexError:", e)
```

A closing bracket with nothing open crashes. Check `if not stack` before popping.

## Quiz

### In a "next greater element" stack, why do values decrease from bottom to top?
- [ ] By coincidence
- [x] Any smaller item would already have been popped by the bigger one after it
- [ ] Because we sort the stack
Why: A bigger item arriving answers every smaller waiting item, so only items larger than everything after them remain.

### What's the time complexity of the monotonic stack scan?
- [ ] O(n²) because of the inner while
- [x] O(n), since each index is pushed and popped at most once
- [ ] O(n log n)
Why: Total pops can't exceed total pushes, which is n.

## Exercise: stock-span | Stock span
For each day, the span is the number of consecutive days ending today (including today) whose price was less than or equal to today's price. Write `spans(prices)` that returns the span for every day in O(n) with a monotonic stack of `(price, span)` pairs.

```python starter
def spans(prices):
    # TODO: pop smaller-or-equal prices and add their spans to today's
    pass
```

```python checks
check("example", lambda: spans([100, 80, 60, 70, 60, 75, 85]), [1, 1, 1, 2, 1, 4, 6])
check("increasing", lambda: spans([1, 2, 3]), [1, 2, 3])
check("equal prices", lambda: spans([5, 5, 5]), [1, 2, 3])
check("empty", lambda: spans([]), [])
check("big decreasing", lambda: spans(list(range(100000, 0, -1)))[-1], 1)
check("big increasing", lambda: spans(list(range(100000)))[-1], 100000)
```

## Ladder
- easy: Valid Parentheses
- easy: Baseball Game
- medium: Daily Temperatures
- medium: Evaluate Reverse Polish Notation
- medium: Decode String
- medium: Asteroid Collision
- hard: Largest Rectangle in Histogram
- hard: Basic Calculator
