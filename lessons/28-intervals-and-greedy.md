---
id: intervals-and-greedy
unit: 3
title: Intervals and greedy choices
minutes: 35
summary: Sort intervals by start or by end and most interval problems become one left-to-right pass. Greedy algorithms make the locally best choice at each step, and they work when you can argue that the choice never hurts later.
---

## Signals
- Pairs of `[start, end]`: meetings, bookings, ranges, balloons
- Merge, insert, count overlaps, remove the fewest to avoid overlaps
- "Minimum number of rooms / arrows / platforms"
- "Can you reach the end?", jumps, gas stations
- Scheduling as many non-overlapping tasks as possible

## Sort, then sweep

Sorting by start time means each interval only needs to be compared with the last merged one.

```python
def total_covered(intervals):
    total = 0
    cur_start = cur_end = None
    for start, end in sorted(intervals):
        if cur_end is None or start > cur_end:
            if cur_end is not None:
                total += cur_end - cur_start
            cur_start, cur_end = start, end
        else:
            cur_end = max(cur_end, end)
    if cur_end is not None:
        total += cur_end - cur_start
    return total

print(total_covered([(1, 3), (2, 5), (7, 9), (8, 8)]))
```

`(1, 3)` and `(2, 5)` overlap into `(1, 5)`, length 4; `(7, 9)` adds 2.

## Counting overlaps with events

To find the most intervals overlapping at once (for example, how many rooms you need), turn each interval into a +1 event at its start and a -1 event at its end, sort the events, and keep a running count.

```python
def rooms_needed(meetings):
    events = []
    for start, end in meetings:
        events.append((start, 1))
        events.append((end, -1))
    events.sort()
    busy = most = 0
    for time, change in events:
        busy += change
        most = max(most, busy)
    return most

print(rooms_needed([(0, 30), (5, 10), (15, 20)]))
print(rooms_needed([(1, 5), (5, 10)]))
```

Sorting `(time, change)` puts `-1` before `+1` at the same time, so a meeting ending at 5 frees its room before one starting at 5 needs it.

## Greedy: earliest end first

To keep as many non-overlapping intervals as possible, always pick the one that **ends earliest**. It leaves the most room for the rest, and swapping any other choice for it never makes things worse.

```python
def max_non_overlapping(intervals):
    count, last_end = 0, float("-inf")
    for start, end in sorted(intervals, key=lambda iv: iv[1]):
        if start >= last_end:
            count += 1
            last_end = end
    return count

talks = [(1, 4), (3, 5), (0, 6), (5, 7), (3, 9), (5, 9), (6, 10), (8, 11)]
print(max_non_overlapping(talks))
```

## When greedy is wrong

Greedy only works when you can argue the local choice is safe. Taking the biggest coin first is optimal for US coins, but not for every coin system.

```python
def greedy_coins(coins, amount):
    count = 0
    for c in sorted(coins, reverse=True):
        count += amount // c
        amount %= c
    return count if amount == 0 else -1

print(greedy_coins([25, 10, 5, 1], 63))
print(greedy_coins([4, 3, 1], 6), "but 3 + 3 uses 2 coins")
```

If you can't explain why the greedy choice is always safe, test it against a brute force on small inputs, or use DP.

## Compare: Sort by start or by end?

| Goal | Sort by | Then |
|---|---|---|
| Merge overlapping intervals | Start | Extend the last merged interval or start a new one |
| Insert one interval into sorted ones | Start (already sorted) | Copy before, merge overlaps, copy after |
| Most non-overlapping / fewest removals | End | Take each interval that starts after the last taken end |
| Most overlapping at once (rooms) | Event time | +1 at start, -1 at end, running count |

## Pitfall: Forgetting to sort

```python
def merge_unsorted(intervals):
    merged = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged

print(merge_unsorted([(5, 6), (1, 3), (2, 5)]))
```

The merge assumes each interval starts no earlier than the previous one. Unsorted, `(1, 3)` gets "merged" into `(5, 6)` just because 1 ≤ 6, and the answer `[[5, 6]]` loses everything before 5. Sorted by start, the right answer is `[[1, 6]]`.

## Quiz

### To keep the maximum number of non-overlapping meetings, which do you pick first?
- [ ] The one that starts earliest
- [x] The one that ends earliest
- [ ] The shortest one
Why: Ending earliest leaves the most time for the remaining meetings; an exchange argument shows it's never worse.

### When is a greedy algorithm safe to use?
- [ ] Whenever it's fast
- [x] When you can show that the local choice never hurts the final answer
- [ ] When the input is sorted
Why: Greedy fails silently otherwise; the coin example shows a natural-looking greedy giving a worse answer.

## Exercise: min-arrows | Fewest arrows to burst balloons
Each balloon spans `[start, end]` on the x-axis. An arrow shot at `x` bursts every balloon with `start <= x <= end`. Write `min_arrows(balloons)` that returns the fewest arrows needed to burst them all. Sort by end, and shoot at a balloon's end whenever it isn't already burst.

```python starter
def min_arrows(balloons):
    # TODO: sort by end; one arrow per balloon not covered by the last arrow
    pass
```

```python checks
check("example", lambda: min_arrows([[10, 16], [2, 8], [1, 6], [7, 12]]), 2)
check("no overlaps", lambda: min_arrows([[1, 2], [3, 4], [5, 6], [7, 8]]), 4)
check("touching", lambda: min_arrows([[1, 2], [2, 3], [3, 4], [4, 5]]), 2)
check("empty", lambda: min_arrows([]), 0)
check("nested", lambda: min_arrows([[1, 10], [2, 3], [4, 5]]), 2)
```

## Ladder
- easy: Summary Ranges
- medium: Merge Intervals
- medium: Insert Interval
- medium: Non-overlapping Intervals
- medium: Minimum Number of Arrows to Burst Balloons
- medium: Jump Game
- medium: Gas Station
- hard: Minimum Interval to Include Each Query
- hard: Candy
