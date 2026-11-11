def count_pairs(nums, k):
    seen = {}
    total = 0
    for x in nums:
        total += seen.get(k - x, 0)
        seen[x] = seen.get(x, 0) + 1
    return total
