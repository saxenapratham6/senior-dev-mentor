def count_triplets(nums, target):
    nums = sorted(nums)
    n, count = len(nums), 0
    for a in range(n - 2):
        if a > 0 and nums[a] == nums[a - 1]:
            continue
        i, j = a + 1, n - 1
        while i < j:
            s = nums[a] + nums[i] + nums[j]
            if s == target:
                count += 1
                i += 1
                while i < j and nums[i] == nums[i - 1]:
                    i += 1
                j -= 1
            elif s < target:
                i += 1
            else:
                j -= 1
    return count
