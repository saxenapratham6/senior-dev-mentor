from bisect import bisect_left, bisect_right


def search_range(nums, target):
    i = bisect_left(nums, target)
    if i == len(nums) or nums[i] != target:
        return (-1, -1)
    return (i, bisect_right(nums, target) - 1)
