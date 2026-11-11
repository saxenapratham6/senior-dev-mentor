def spans(prices):
    stack, out = [], []
    for p in prices:
        span = 1
        while stack and stack[-1][0] <= p:
            span += stack.pop()[1]
        stack.append((p, span))
        out.append(span)
    return out
