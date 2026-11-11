def running_max(nums):
    out = []
    best = None
    for x in nums:
        best = x if best is None or x > best else best
        out.append(best)
    return out
