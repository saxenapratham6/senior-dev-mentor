export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface MentorProvider {
  readonly label: string;
  /** Streams the reply as text chunks. Throws ProviderError on failures the student can fix. */
  stream(system: string, turns: ChatTurn[], signal: AbortSignal): AsyncIterable<string>;
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
