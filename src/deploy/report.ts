// The deploy check, all together: what the app is, where it can go, what's
// ready, and the steps. An AI model can add an explanation pitched at the
// student, but it can't change a check, and only commands from the target's
// list get through.
import { z } from "zod";
import type { RepoIndex } from "../repo/types";
import type { MentorProvider } from "../providers/types";
import { guardExplanation, GuardOptions } from "../guardrails";
import { indexDigest } from "../tour/ai/digest";
import { redactSecrets } from "../tour/ai/redact";
import { clip } from "../tour/ai/normalize";
import { basename } from "../repo/files";
import { AppProfile, KIND_WORDS, profileApp } from "./profile";
import { Check, runChecks } from "./checks";
import { CATALOG_CHECKED, deploySteps, DeployStep, Failure, likelyFailures, rankTargets, TARGETS } from "./targets";
import type { Level } from "../tour/tour";

export interface DeployReport {
  app: { kind: string; words: string; runtime: string; evidence: string[]; db?: string; configs: { target: string; path: string }[] };
  checks: Check[];
  score: { pass: number; warn: number; fail: number };
  targets: { id: string; name: string; reasons: string[]; cost: string; good: string; watch: string; docs: string; pricing: string; configured?: string }[];
  chosen: string;
  steps: DeployStep[];
  failures: Failure[];
  catalogChecked: string;
  explained?: DeployExplanation;
}

export function deployReport(index: RepoIndex, texts: Map<string, string | undefined>, targetId?: string): { report: DeployReport; profile: AppProfile } {
  const p = profileApp(index, texts);
  const checks = runChecks(index, texts, p).filter((c) => c.status !== "n/a");
  const fits = rankTargets(p);
  const chosen = fits.find((f) => f.target.id === targetId) ?? fits[0];
  const report: DeployReport = {
    app: { kind: p.kind, words: KIND_WORDS[p.kind], runtime: p.runtime, evidence: p.evidence, db: p.db ? `${p.db.kind} (${p.db.evidence})` : undefined, configs: p.configs },
    checks,
    score: { pass: checks.filter((c) => c.status === "pass").length, warn: checks.filter((c) => c.status === "warn").length, fail: checks.filter((c) => c.status === "fail").length },
    targets: fits.map((f) => ({ id: f.target.id, name: f.target.name, reasons: f.reasons, cost: f.target.cost, good: f.target.good, watch: f.target.watch, docs: f.target.docs, pricing: f.target.pricing, configured: f.configured })),
    chosen: chosen?.target.id ?? "",
    steps: chosen ? deploySteps(p, chosen.target) : [],
    failures: chosen ? likelyFailures(p, chosen.target) : [],
    catalogChecked: CATALOG_CHECKED,
  };
  return { report, profile: p };
}

// ------------------------------------------------------------------ with AI

export const DeployExplanationSchema = z.object({
  intro: z.string(), // what deploying this app means, at the reader's level
  fixFirst: z.array(z.object({ check: z.string(), explain: z.string() })), // the failing checks, explained
  steps: z.array(z.object({ title: z.string(), why: z.string(), command: z.string() })),
  risks: z.array(z.object({ symptom: z.string(), meaning: z.string(), check: z.string() })),
});
export type DeployExplanation = z.infer<typeof DeployExplanationSchema>;

export function deployPrompt(digest: string, level: Level): string {
  return `You are a senior engineer helping a ${level === "new" ? "student deploy their first app. Use plain words and explain every term (host, environment variable, build, port) the first time" : "developer deploy an app. Be brief and precise"}. You teach; you never do it for them.

You get the repository index, the deploy checks (worked out by reading the code, they are facts: don't contradict them), the chosen host, and the repo's deploy-related files.

Write:
- intro: what deploying this particular app involves, in 2-4 sentences.
- fixFirst: one entry per failing or warning check, using its exact title, saying in your own words why it will break the deploy here and what to look at. Describe changes in words; never write code or config files for them.
- steps: the steps for the chosen host, in order, each with a short title, why it's needed, and at most one shell command they type themselves (or an empty string). Only commands for that host's tools, git, and the app's own build.
- risks: up to 4 things most likely to go wrong for this app on this host: what they'd see, what it means, what to check.

${digest}`;
}

export async function explainDeploy(
  o: { index: RepoIndex; texts: Map<string, string | undefined>; report: DeployReport; provider: MentorProvider; level: Level; guard?: GuardOptions; signal: AbortSignal; never?: (p: string) => boolean },
): Promise<DeployExplanation> {
  const { index, texts, report } = o;
  const target = TARGETS.find((t) => t.id === report.chosen);
  // Only deploy-related files go along: manifests and platform configs, secrets blanked.
  const files = index.files.filter(
    (f) => f.read && f.kind !== "secret" && !o.never?.(f.path) && (/^(package\.json|requirements.*\.txt|pyproject\.toml|go\.mod|procfile|dockerfile|docker-compose\.ya?ml|fly\.toml|render\.ya?ml|vercel\.json|netlify\.toml|app\.json|\.env\.example)$/i.test(basename(f.path)) || /^\.github\/workflows\//.test(f.path)),
  );
  const user = [
    `App: ${report.app.words}. Runtime: ${report.app.runtime}. ${report.app.evidence.join("; ")}${report.app.db ? `. Database: ${report.app.db}` : ""}.`,
    `Checks:\n${report.checks.map((c) => `- [${c.status}] ${c.title}${c.where ? ` (${c.where.path}:${c.where.line + 1})` : ""}: ${c.why}`).join("\n")}`,
    `Chosen host: ${target?.name ?? "none"} (${target?.docs ?? ""}). ${target?.good ?? ""} Watch out: ${target?.watch ?? ""}`,
    `Steps worked out without AI:\n${report.steps.map((s) => `- ${s.title}${s.command ? ` [${s.command}]` : ""}`).join("\n")}`,
    `Deploy-related files:\n\n${files.map((f) => `=== ${f.path} ===\n${redactSecrets((texts.get(f.path) ?? "").slice(0, 4000)).text}`).join("\n\n")}`,
  ].join("\n\n---\n\n");
  const raw = (await o.provider.json(deployPrompt(indexDigest(index), o.level), user, DeployExplanationSchema, o.signal, { effort: "medium", cacheSystem: true, what: "deploy guide" })) as DeployExplanation;
  return normalizeExplanation(raw, report, [...texts.values()].filter((t): t is string => !!t), o.guard);
}

/** Every command must start with one the target allows (or git / the app's own scripts); text is guarded. */
export function normalizeExplanation(raw: DeployExplanation, report: DeployReport, corpus: string[], guard?: GuardOptions): DeployExplanation {
  const target = TARGETS.find((t) => t.id === report.chosen);
  const allowed = [...(target?.commands ?? []), "git ", "git push", "npm ci", "npm install", "npm run build", "npm test", "pip install -r requirements.txt", "python -m venv", "pytest", "go build", "go test"];
  const okCommand = (c: string) => {
    const cmd = c.trim().replace(/^\$\s*/, "");
    return !!cmd && !cmd.includes("\n") && cmd.length <= 120 && !/[;&|`]|\$\(/.test(cmd.replace(/&&/g, "")) && allowed.some((a) => cmd === a.trim() || cmd.startsWith(a.trim() + " ") || cmd.startsWith(a));
  };
  const text = (s: string, max: number) => clip(guardExplanation(s ?? "", corpus, guard).text.trim(), max);
  const titles = new Set(report.checks.filter((c) => c.status !== "pass").map((c) => c.title));
  return {
    intro: text(raw.intro, 700),
    fixFirst: (raw.fixFirst ?? []).filter((f) => titles.has(f.check)).map((f) => ({ check: f.check, explain: text(f.explain, 500) })),
    steps: (raw.steps ?? []).slice(0, 12).map((s) => ({ title: text(s.title, 100), why: text(s.why, 400), command: okCommand(s.command ?? "") ? s.command.trim().replace(/^\$\s*/, "") : "" })),
    risks: (raw.risks ?? []).slice(0, 4).map((r) => ({ symptom: text(r.symptom, 160), meaning: text(r.meaning, 300), check: text(r.check, 300) })),
  };
}
