import type { z } from "zod";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface MentorProvider {
  readonly label: string;
  /** Streams the reply as text chunks. Throws ProviderError on failures the student can fix. */
  stream(system: string, turns: ChatTurn[], signal: AbortSignal): AsyncIterable<string>;
  /** One reply that must match a JSON schema. Returns the parsed object, still unvalidated by the caller. */
  json(system: string, user: string, schema: z.ZodType, signal: AbortSignal, opts?: JsonOptions): Promise<unknown>;
}

export interface JsonOptions {
  /** Overrides the effort setting for this call (Claude only). */
  effort?: "low" | "medium" | "high";
  /** The system prompt is shared by several calls: cache it (Claude only). */
  cacheSystem?: boolean;
  /** Error messages for this kind of request, written for the student. */
  what?: string;
}

/** An error with a message written for the student, plus an optional fix-it action. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly action?: "setApiKey" | "openSettings",
  ) {
    super(message);
  }
}
