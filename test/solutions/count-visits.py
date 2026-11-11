def cells_visited(moves):
    step = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}
    r, c = 0, 0
    seen = {(r, c)}
    for m in moves:
        dr, dc = step[m]
        r, c = r + dr, c + dc
        seen.add((r, c))
    return len(seen)
