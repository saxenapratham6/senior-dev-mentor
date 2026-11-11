import heapq
from collections import Counter


def least_intervals(tasks, n):
    heap = [-c for c in Counter(tasks).values()]
    heapq.heapify(heap)
    slots = 0
    while heap:
        taken = []
        for _ in range(n + 1):
            if heap:
                taken.append(heapq.heappop(heap) + 1)
        for c in taken:
            if c < 0:
                heapq.heappush(heap, c)
        slots += n + 1 if heap else len(taken)
    return slots
