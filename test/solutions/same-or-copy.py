def describe(a, b):
    if a is b:
        return "same object"
    if a == b:
        return "equal copy"
    return "different"


def safe_copy(grid):
    return [row[:] for row in grid]
