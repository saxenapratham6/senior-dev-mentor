// Builds the Express app: JSON parsing, then the notes routes.
const express = require("express");
const notes = require("./routes/notes");

const app = express();
app.use(express.json());
app.use("/api/notes", notes);

module.exports = app;
