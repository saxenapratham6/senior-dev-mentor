def average(values):
    if not values:
        raise ValueError("no values")
    for v in values:
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise TypeError(f"not a number: {v!r}")
    return sum(values) / len(values)
