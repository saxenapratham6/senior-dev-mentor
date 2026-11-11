const { validateNote } = require("../src/utils/validate");

test("empty notes are rejected", () => {
  expect(validateNote({ text: "" })).toBe("text is required");
});
