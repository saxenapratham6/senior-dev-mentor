def fewest_coins(coins, amount):
    inf = float("inf")
    best = [0] + [inf] * amount
    for a in range(1, amount + 1):
        for coin in coins:
            if coin <= a and best[a - coin] + 1 < best[a]:
                best[a] = best[a - coin] + 1
    return best[amount] if best[amount] != inf else -1
