// Blanks out anything that looks like a password, key or token before code is
// sent to an AI model. Files that usually hold secrets (.env, *.pem…) are
// never read at all (see repo/files.ts); this catches keys pasted into code.

export const REDACTED = "«redacted: looks like a secret»";

const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, // AWS access key id
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, // OpenAI-style
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g, // Stripe
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API key
  /\bya29\.[0-9A-Za-z_-]{20,}/g, // Google OAuth token
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s:/@]{3,}@/gi, // credentials inside a URL
];

/** `password = "hunter2hunter2"`, `API_KEY: 'abc…'`: a long quoted value next to a secret-sounding name. */
const ASSIGNED = /\b([\w.-]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|auth)[\w.-]*)(["']?\s*[:=]\s*)(["'`])([^"'`\s]{8,})\3/gi;

export function redactSecrets(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const re of PATTERNS)
    out = out.replace(re, (m) => {
      count++;
      // Keep a URL's scheme and host readable; only the credentials go.
      return /^[a-z][a-z0-9+.-]*:\/\//i.test(m) ? m.replace(/\/\/.*@$/, `//${REDACTED}@`) : REDACTED;
    });
  out = out.replace(ASSIGNED, (m, name: string, sep: string, q: string, value: string) => {
    if (value === REDACTED || /^(process\.env|os\.environ|\$\{|<|your|xxx|changeme|example|placeholder|test|dummy)/i.test(value)) return m;
    count++;
    return `${name}${sep}${q}${REDACTED}${q}`;
  });
  return { text: out, count };
}
