from wordcount.counter import count_words


def test_counts_words():
    assert count_words("a b  c") == 3
