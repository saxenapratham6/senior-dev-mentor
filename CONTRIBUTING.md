# Contributing

Thanks for helping students learn! A few ground rules keep the project true to its goal.

## The one rule

**Never weaken the guardrails to make the AI "more helpful".** If a change lets the mentor show more of a solution, it needs a test in `test/guardrails.test.ts` and a clear teaching reason in the PR.

## Workflow

1. Fork and branch from `main`.
2. `npm install`, then `npm test` and `npm run typecheck` must pass.
3. For UI changes, include a screenshot (see `dev/preview.mjs` for a browser preview).
4. Open a pull request describing what a student would notice.

## Good first contributions

- New visualizations (stack/queue, linked lists, graph BFS/DFS, hash tables)
- More save-nudge heuristics in `src/heuristics.ts` (each one asks a question, never fixes)
- More request-filter phrasings in `src/guardrails.ts`, with allowed and blocked test cases
- Course presets (for example CS 124 / CS 128 / CS 225 topic lists for **Teach me**)
- Accessibility: keyboard navigation and screen-reader labels in the webview
