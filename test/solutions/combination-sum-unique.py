def combos(candidates, target):
    nums = sorted(candidates)
    out, path = [], []

    def explore(start, remaining):
        if remaining == 0:
            out.append(path[:])
            return
        for i in range(start, len(nums)):
            if i > start and nums[i] == nums[i - 1]:
                continue
            if nums[i] > remaining:
                break
            path.append(nums[i])
            explore(i + 1, remaining - nums[i])
            path.pop()

    explore(0, target)
    return sorted(out)
