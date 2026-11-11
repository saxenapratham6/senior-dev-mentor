def long_words(words, n):
    return [w for w in words if len(w) > n]


def first_letters(words):
    return {w: w[0] for w in words if w}


def vowel_set(text):
    return {c for c in text.lower() if c in "aeiou"}
