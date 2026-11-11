from functools import cache


def count_paths(rows, cols, blocked):
    @cache
    def paths(r, c):
        if r >= rows or c >= cols or (r, c) in blocked:
            return 0
        if (r, c) == (rows - 1, cols - 1):
            return 1
        return paths(r + 1, c) + paths(r, c + 1)

    return paths(0, 0)
