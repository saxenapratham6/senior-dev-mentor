def is_clean_palindrome(s):
    kept = [c.lower() for c in s if c.isalnum()]
    return kept == kept[::-1]
