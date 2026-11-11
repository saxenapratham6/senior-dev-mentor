def min_arrows(balloons):
    arrows, last = 0, float("-inf")
    for start, end in sorted(balloons, key=lambda b: b[1]):
        if start > last:
            arrows += 1
            last = end
    return arrows
