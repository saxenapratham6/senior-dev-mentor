def make_multiplier(k):
    def times(x):
        return x * k
    return times


def compose(f, g):
    return lambda x: f(g(x))
