"""Talks to PostgreSQL. DATABASE_URL says where it is."""
import os

from sqlalchemy import create_engine, text

engine = create_engine(os.environ["DATABASE_URL"])


def get_items():
    with engine.connect() as c:
        return [dict(r._mapping) for r in c.execute(text("SELECT * FROM items"))]


def add_item(name):
    with engine.begin() as c:
        c.execute(text("INSERT INTO items (name) VALUES (:n)"), {"n": name})
    return {"name": name}
