def max_loot(values):
    def line(vals):
        take = skip = 0
        for v in vals:
            take, skip = skip + v, max(take, skip)
        return max(take, skip)

    if len(values) <= 1:
        return values[0] if values else 0
    return max(line(values[1:]), line(values[:-1]))
