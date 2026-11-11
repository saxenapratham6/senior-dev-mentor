def chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def first_square_over(limit):
    from itertools import count
    return next(n * n for n in count(1) if n * n > limit)
