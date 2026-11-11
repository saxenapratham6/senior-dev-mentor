def cpp_div(a, b):
    q = abs(a) // abs(b)
    return q if (a < 0) == (b < 0) else -q


def cpp_mod(a, b):
    return a - cpp_div(a, b) * b
