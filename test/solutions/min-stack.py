class MinStack:
    def __init__(self):
        self.items = []

    def push(self, x):
        low = min(x, self.items[-1][1]) if self.items else x
        self.items.append((x, low))

    def pop(self):
        return self.items.pop()[0]

    def top(self):
        return self.items[-1][0]

    def get_min(self):
        return self.items[-1][1]
