const express = require("express");
const db = require("../db");
const { validateNote } = require("../utils/validate");

const router = express.Router();

router.get("/", async (req, res) => {
  res.json(await db.query("SELECT * FROM notes"));
});

router.post("/", async (req, res) => {
  const error = validateNote(req.body);
  if (error) return res.status(400).json({ error });
  res.status(201).json(await db.query("INSERT INTO notes (text) VALUES ($1) RETURNING *", [req.body.text]));
});

module.exports = router;
