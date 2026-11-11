---
id: linked-lists
unit: 3
title: Linked lists
minutes: 35
summary: Linked list problems are about rewiring pointers without losing your place. Three tricks cover most of them, a dummy head, fast and slow pointers, and in-place reversal, and drawing boxes and arrows beats guessing.
---

## Signals
- You're given a `ListNode` head
- "In place", "O(1) extra space", "without converting to an array"
- Find the middle, detect a cycle, or the nth node from the end
- Reverse all or part of the list, reorder, or merge lists

## Helpers to see what you're doing

Converting between Python lists and linked lists makes testing easy. Use them while practicing, not in your final solution.

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next

def build(values):
    dummy = ListNode()
    tail = dummy
    for v in values:
        tail.next = ListNode(v)
        tail = tail.next
    return dummy.next

def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

print(to_list(build([1, 2, 3])))
```

`build` already shows trick one: a **dummy** node in front of the head, so adding the first node needs no special case.

## Fast and slow pointers

Move `slow` one step and `fast` two steps. When `fast` reaches the end, `slow` is in the middle. If there's a cycle, `fast` eventually laps `slow` and they meet.

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next

def build(values):
    dummy = tail = ListNode()
    for v in values:
        tail.next = ListNode(v)
        tail = tail.next
    return dummy.next

def middle(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
    return slow.val

def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:
            return True
    return False

print(middle(build([1, 2, 3, 4, 5])), middle(build([1, 2, 3, 4])))
loop = build([1, 2, 3])
loop.next.next.next = loop.next
print(has_cycle(build([1, 2, 3])), has_cycle(loop))
```

For an even length, this `middle` returns the second of the two middle nodes.

## Worked example: removing duplicates from a sorted list

Rewire `next` to skip nodes. Note the comparison uses `is` for identity in the cycle check above, but `==` on values here.

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next

def build(values):
    dummy = tail = ListNode()
    for v in values:
        tail.next = ListNode(v)
        tail = tail.next
    return dummy.next

def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

def dedupe(head):
    node = head
    while node and node.next:
        if node.next.val == node.val:
            node.next = node.next.next
        else:
            node = node.next
    return head

print(to_list(dedupe(build([1, 1, 2, 3, 3, 3]))))
```

Only advance `node` when the next value differs; otherwise you'd skip checking the new neighbor.

## Compare: The three tricks

| Trick | Use it when | Watch out for |
|---|---|---|
| Dummy head | The head itself might change (insert, delete, merge) | Return `dummy.next`, not `dummy` |
| Fast and slow | Middle, cycle, nth from the end (gap of n) | Check `fast and fast.next` before stepping twice |
| In-place reversal | Reverse a whole list or a section | Save `next` **before** you overwrite it |

## Pitfall: Losing the rest of the list

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next

head = ListNode(1, ListNode(2, ListNode(3)))
prev, node = None, head
node.next = prev
node = node.next
print(node)
```

Overwriting `node.next` before saving it cuts off the rest of the list, and you can't get it back. When reversing, always do `nxt = node.next` first.

## Quiz

### Why use a dummy head when merging two sorted lists?
- [x] So adding the first node needs no special case
- [ ] It makes the merge faster
- [ ] Python requires it
Why: With a dummy, you always append to `tail.next`, even when the result is still empty.

### In cycle detection, why does the fast pointer move two steps?
- [ ] To finish faster
- [x] So inside a cycle the gap shrinks by one each step and the pointers must meet
- [ ] To skip duplicate values
Why: Each step, fast gains one node on slow, so within the cycle it catches up after at most the cycle's length.

## Exercise: palindrome-list | Palindrome linked list
Write `is_palindrome(head)` that returns True if the list's values read the same forwards and backwards, using O(1) extra space: find the middle with fast and slow pointers, reverse the second half in place, then compare the halves. The `ListNode` class and a `build` helper are provided.

```python starter
class ListNode:
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next


def build(values):
    dummy = tail = ListNode()
    for v in values:
        tail.next = ListNode(v)
        tail = tail.next
    return dummy.next


def is_palindrome(head):
    # TODO: middle, reverse second half, compare
    pass
```

```python checks
check("odd palindrome", lambda: is_palindrome(build([1, 2, 3, 2, 1])), True)
check("even palindrome", lambda: is_palindrome(build([1, 2, 2, 1])), True)
check("not one", lambda: is_palindrome(build([1, 2, 3])), False)
check("single", lambda: is_palindrome(build([7])), True)
check("empty", lambda: is_palindrome(build([])), True)
check("long", lambda: is_palindrome(build(list(range(50000)) + list(range(49999, -1, -1)))), True)
```

## Ladder
- easy: Reverse Linked List
- easy: Merge Two Sorted Lists
- easy: Linked List Cycle
- medium: Remove Nth Node From End of List
- medium: Reorder List
- medium: Add Two Numbers
- medium: LRU Cache
- hard: Reverse Nodes in k-Group
- hard: Merge k Sorted Lists
