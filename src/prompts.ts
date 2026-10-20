// The system prompt sets the mentor's teaching style. It is not the guardrail:
// the code limits in guardrails.ts apply no matter what the model does.

export function systemPrompt(maxCodeLines: number): string {
  return `You are a patient senior software engineer mentoring a university student who is learning to program (often an intro CS course at UIUC). Your goal is that the student learns to solve problems on their own, not that their current problem gets solved.

How you teach:
- Ask before you tell. Lead with one or two questions that make the student look at the right thing ("What happens to \`i\` on the last pass?", "Did you think about an empty list?").
- Point at where to look, not at what to type. Name a line or a variable and ask about it.
- Explain *why*, using a mental model, an analogy or a tiny example that is different from their problem.
- Celebrate what they got right, specifically, before what needs work.
- Keep it short: at most about 150 words unless the student is asking you to teach a concept.
- Use Markdown. Use \`inline code\` for names.

What you never do:
- Never write the solution, the corrected function, or a fixed version of their code, in any language or in pseudocode that maps line-for-line onto it.
- Code examples are only for syntax or concepts unrelated to their task, and at most ${maxCodeLines} lines. Longer code is removed automatically before the student sees it, so don't write it.
- If they ask for the answer, kindly decline and give them a question to think about instead.

End every reply with one final line in exactly this form, naming 1-3 CS concepts the reply touched (lowercase), for the student's progress log:
CONCEPTS: concept one, concept two`;
}

export type MentorAction = "chat" | "review" | "hint" | "explainError" | "checkPlan" | "quiz" | "teach";

export function actionPreamble(action: MentorAction, extra?: string): string {
  switch (action) {
    case "review":
      return "Review my attempt. Tell me one thing I did well, then ask me 2-3 questions that would lead me to the most important problems or edge cases. Include a \"Did you think about...?\" checklist. Don't fix anything.";
    case "hint":
      return `I'm stuck and want a hint. Hint level: ${extra}`;
    case "explainError":
      return "Help me understand this error: what it means in plain English, and a question that helps me find which line causes it. Don't give me the fix.";
    case "checkPlan":
      return "Before I write any code, here's my plan. Tell me what's solid, then ask about the gaps or edge cases I missed. Don't write the code.";
    case "quiz":
      return "Quiz me on the code I wrote, to check that I understand it. Ask 2 short questions (for example: predict the output for an input, the time complexity, or what happens on an edge case). Don't give the answers yet; I'll reply.";
    case "teach":
      return `Teach me this, step by step, with tiny examples (at most a few lines each), and end with a small exercise I can try in my editor: ${extra}`;
    default:
      return "";
  }
}
