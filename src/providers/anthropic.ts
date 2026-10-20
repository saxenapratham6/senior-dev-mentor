import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { ChatTurn, MentorProvider, ProviderError } from "./types";

// Models that accept the server-side refusal fallback ("default" routing).
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export class AnthropicProvider implements MentorProvider {
  readonly label: string;
  private readonly client: Anthropic;

  constructor(
    apiKey: string | undefined,
    private readonly model: string,
    private readonly effort: "low" | "medium" | "high",
  ) {
    // Without a stored key the SDK falls back to ANTHROPIC_API_KEY or an `ant auth login` profile.
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
    this.label = `Claude (${model})`;
  }

  async *stream(system: string, turns: ChatTurn[], signal: AbortSignal): AsyncIterable<string> {
    const params = {
      model: this.model,
      max_tokens: 16000,
      thinking: { type: "adaptive" as const },
      output_config: { effort: this.effort },
      system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
      messages: turns,
      ...(FALLBACK_MODELS.has(this.model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
        : {}),
    };

    let stream;
    try {
      stream = this.client.beta.messages.stream(params as Anthropic.Beta.Messages.MessageCreateParamsStreaming, { signal });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        yield "\n\nI can't help with that one. Let's get back to your code. What are you working on?";
      }
    } catch (err) {
      throw toProviderError(err);
    }
  }

  async json(system: string, user: string, schema: z.ZodType, signal: AbortSignal): Promise<unknown> {
    try {
      const response = await this.client.messages.parse(
        {
          model: this.model,
          max_tokens: 16000,
          thinking: { type: "adaptive" },
          output_config: { effort: this.effort, format: zodOutputFormat(schema) },
          system,
          messages: [{ role: "user", content: user }],
        },
        { signal },
      );
      if (response.stop_reason === "refusal") throw new ProviderError("Claude declined to draw that one. Try describing it differently.");
      if (response.stop_reason === "max_tokens") throw new ProviderError("That visualization got too big. Try something smaller, like fewer elements.");
      if (response.parsed_output == null) throw new ProviderError("Claude's visualization didn't come back in the expected shape. Try again.");
      return response.parsed_output;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw toProviderError(err);
    }
  }
}

function toProviderError(err: unknown): unknown {
  if (err instanceof Anthropic.AuthenticationError) {
    return new ProviderError("Your Anthropic API key was rejected. Set a new one to keep going.", "setApiKey");
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("This API key can't use that model. Pick another model in settings.", "openSettings");
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new ProviderError("That Claude model ID wasn't found. Check the model in settings.", "openSettings");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError("Claude is rate-limiting us. Take a minute to think it through yourself, then try again.");
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new ProviderError(`Claude rejected the request: ${err.message}`);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError("Couldn't reach Claude. Check your internet connection, or switch to a local Ollama model in settings.", "openSettings");
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError(`Claude returned an error (${err.status}). Try again in a moment.`);
  }
  if (err instanceof Error && /api[_ ]?key|credentials|authentication/i.test(err.message)) {
    return new ProviderError("No Anthropic API key is set yet. Add one, or switch to a free local Ollama model in settings.", "setApiKey");
  }
  return err;
}
