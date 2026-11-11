def group_by_distance(points):
    groups = {}
    for x, y in points:
        groups.setdefault(x * x + y * y, []).append((x, y))
    return {d: sorted(ps) for d, ps in groups.items()}
