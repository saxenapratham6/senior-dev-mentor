import heapq


def k_closest(points, k):
    return heapq.nsmallest(k, points, key=lambda p: (p[0] ** 2 + p[1] ** 2, p))
