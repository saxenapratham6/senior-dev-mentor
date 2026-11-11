function validateNote(body) {
  if (!body || typeof body.text !== "string" || !body.text.trim()) return "text is required";
  return null;
}

module.exports = { validateNote };
