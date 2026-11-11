"""The items API: lists and adds items, with a health check for the host."""
import os

from fastapi import FastAPI

from db import get_items, add_item

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/items")
def list_items():
    return get_items()


@app.post("/items")
def create_item(name: str):
    return add_item(name)
