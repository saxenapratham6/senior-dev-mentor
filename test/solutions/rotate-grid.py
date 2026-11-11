def rotate_clockwise(grid):
    return [list(row) for row in zip(*grid[::-1])]


def columns_sums(grid):
    return [sum(col) for col in zip(*grid)]
