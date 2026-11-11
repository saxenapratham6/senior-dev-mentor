"""The todo web app: shows the list and handles adding and finishing items."""
from flask import Flask, redirect, render_template, request

from db import db, init_db
from models import Todo

app = Flask(__name__)
init_db(app)


@app.route("/")
def index():
    return render_template("index.html", todos=Todo.query.all())


@app.route("/add", methods=["POST"])
def add():
    db.session.add(Todo(title=request.form["title"]))
    db.session.commit()
    return redirect("/")


@app.route("/done/<int:todo_id>", methods=["POST"])
def done(todo_id):
    Todo.query.get_or_404(todo_id).done = True
    db.session.commit()
    return redirect("/")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
