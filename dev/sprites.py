"""Draws the 8-bit panda: every pose is pixel art on a 20x20 grid, outlined
and padded to 22x22, written to media/panda/<pose>.svg. Edit the pixel maps below, then run:

    python3 dev/sprites.py

Characters: . empty   K black   W white   P pink (cheeks)   R red (mouth)
            G gray (dots, z's)
"""
from pathlib import Path

COLORS = {"K": "#1b1b20", "W": "#f5f5ef", "P": "#f19bb0", "R": "#d9465b", "G": "#8f8fa3", "O": "#a9a9b8"}
SIZE = 22  # the 20x20 art plus a 1-pixel border for the outline

HEAD = [
    "....................",
    "....................",
    "....................",
    "....KK........KK....",
    "...KKKK......KKKK...",
    "...KKKKWWWWWWKKKK...",
    "....KWWWWWWWWWWK....",
    "...KWWWWWWWWWWWWK...",
    "...KWKKKWWWWKKKWK...",
    "...KWKWKWWWWKWKWK...",
    "...KWKKKWWWWKKKWK...",
    "...KWPWWWKKWWWPWK...",
    "....KWWWWWWWWWWK....",
]

BODY = [
    "....KKKKWWWWKKKK....",
    "...KKKKWWWWWWKKKK...",
    "...KKKWWWWWWWWKKK...",
    "....KWWWWWWWWWWK....",
    "....KKKKWWWWKKKK....",
    "...KKKK......KKKK...",
    "....................",
]


def frame(rows):
    assert len(rows) == 20 and all(len(r) == 20 for r in rows), [len(r) for r in rows]
    return [list(r) for r in rows]


def paint(grid, x, y, art):
    """Overlay art (list of strings, '.' = keep) at column x, row y."""
    for dy, row in enumerate(art):
        for dx, ch in enumerate(row):
            if ch != ".":
                grid[y + dy][x + dx] = ch
    return grid


def base():
    return frame(HEAD + BODY)


def sit():
    return base()


def walk(step):
    g = base()
    if step == 1:
        # Bob up one pixel; left foot steps forward.
        g = g[1:] + [list("." * 20)]
        g[17] = list("..KKKK.......KKKK...")
        g[18] = list("....................")
    else:
        # Right foot steps forward.
        g[18] = list("....KKKK.......KKKK.")
    return g


def sleep():
    g = base()
    # Closed eyes: a line instead of a patch with a highlight.
    g[8] = list("...KWWWWWWWWWWWWK...")
    g[9] = list("...KWKKKWWWWKKKWK...")
    g[10] = list("...KWWWWWWWWWWWWK...")
    paint(g, 14, 0, ["GGG.", "..G.", ".G..", "GGG."])
    return g


def think():
    g = base()
    paint(g, 14, 0, [".....G", "...G..", "GG...."][::-1])
    # Paw raised to the chin.
    paint(g, 12, 12, ["KK", "KK"])
    return g


def talk():
    g = base()
    g[12] = list("....KWWWWWRRWWWWK...")
    g[12] = list("....KWWWWRRWWWWK....")
    # Left arm pointing out to the side (toward the code).
    paint(g, 0, 13, ["KKKK", "KKK."])
    return g


def cheer():
    g = base()
    # Happy eyes: upside-down V shapes.
    g[8] = list("...KWWKWWWWWWKWWWK..")
    g[8] = list("...KWWKWWWWWWKWWK...")
    g[9] = list("...KWKWKWWWWKWKWK...")
    g[10] = list("...KWWWWWWWWWWWWK...")
    # Both arms up.
    paint(g, 1, 9, ["KK", "KK", "KK", "KK"])
    paint(g, 17, 9, ["KK", "KK", "KK", "KK"])
    g[13] = list("....KWWWWWWWWWWK....")
    return g


def outline(grid):
    """Pad by one pixel and draw a light outline around the silhouette, so the
    black fur stays visible on dark editor themes."""
    g = [["."] * SIZE] + [["."] + row + ["."] for row in grid] + [["."] * SIZE]
    out = [row[:] for row in g]
    for y in range(SIZE):
        for x in range(SIZE):
            if g[y][x] != ".":
                continue
            near = [g[y + dy][x + dx] for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= y + dy < SIZE and 0 <= x + dx < SIZE]
            if any(c in "KWPR" for c in near):
                out[y][x] = "O"
    return out


def svg(grid):
    rects = []
    for y, row in enumerate(grid):
        x = 0
        while x < len(row):
            ch = row[x]
            if ch == ".":
                x += 1
                continue
            end = x
            while end < len(row) and row[end] == ch:
                end += 1
            rects.append(f'<rect x="{x}" y="{y}" width="{end - x}" height="1" fill="{COLORS[ch]}"/>')
            x = end
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" shape-rendering="crispEdges">{"".join(rects)}</svg>\n'


POSES = {"sit": sit, "walk1": lambda: walk(1), "walk2": lambda: walk(2), "sleep": sleep, "think": think, "talk": talk, "cheer": cheer}

if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "media" / "panda"
    for name, make in POSES.items():
        grid = make()
        assert len(grid) == 20 and all(len(r) == 20 for r in grid), name
        (out / f"{name}.svg").write_text(svg(outline(grid)))
        print(name)
        print("\n".join("".join(r) for r in grid))
        print()
