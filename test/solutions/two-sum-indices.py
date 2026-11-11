def pair_indices(nums, target):
    where = {}
    for j, x in enumerate(nums):
        if target - x in where:
            return (where[target - x], j)
        where.setdefault(x, j)
    return None
