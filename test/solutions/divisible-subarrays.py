def count_divisible(nums, k):
    seen = {0: 1}
    total = count = 0
    for x in nums:
        total = (total + x) % k
        count += seen.get(total, 0)
        seen[total] = seen.get(total, 0) + 1
    return count
