import click

from wordcount.counter import count_words


@click.command()
@click.argument("path")
def main(path):
    with open(path) as f:
        click.echo(count_words(f.read()))
