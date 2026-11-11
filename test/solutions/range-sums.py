from itertools import accumulate


def range_sums(nums, queries):
    prefix = [0, *accumulate(nums)]
    return [prefix[j] - prefix[i] for i, j in queries]
