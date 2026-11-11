def largest_area(grid):
    seen = set()

    def dfs(r, c):
        if r < 0 or c < 0 or r >= len(grid) or c >= len(grid[0]):
            return 0
        if grid[r][c] != 1 or (r, c) in seen:
            return 0
        seen.add((r, c))
        return 1 + dfs(r + 1, c) + dfs(r - 1, c) + dfs(r, c + 1) + dfs(r, c - 1)

    return max((dfs(r, c) for r in range(len(grid)) for c in range(len(grid[0]))), default=0)
