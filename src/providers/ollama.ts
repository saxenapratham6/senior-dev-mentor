import { z } from "zod";
import { ChatTurn, MentorProvider, ProviderError } from "./types";

// Free, offline option for students without an API key: a local Ollama server.
export class OllamaProvider implements MentorProvider {
  readonly label: string;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {
    this.label = `Ollama (${model})`;
  }

  async *stream(system: string, turns: ChatTurn[], signal: AbortSignal): AsyncIterable<string> {
    const res = await this.post({ model: this.model, stream: true, messages: [{ role: "system", content: system }, ...turns] }, signal);
    if (!res.body) throw new ProviderError("Ollama sent an empty response.");

    const decoder = new TextDecoder();
    let buf = "";
    for await (const bytes of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(bytes, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as { message?: { content?: string }; error?: string };
        if (msg.error) throw new ProviderError(`Ollama: ${msg.error}`);
        if (msg.message?.content) yield msg.message.content;
      }
    }
  }

  /** POST to /api/chat, turning connection and model errors into messages the student can act on. */
  private async post(body: object, signal: AbortSignal): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (signal.aborted) throw err;
      throw new ProviderError(`Couldn't reach Ollama at ${this.baseUrl}. Is it running? Start it with \`ollama serve\`.`, "openSettings");
    }
    if (res.status === 404) {
      throw new ProviderError(
        `Ollama doesn't have the model "${this.model}". Download it with \`ollama pull ${this.model}\`, or pick another model in settings.`,
        "openSettings",
      );
    }
    if (!res.ok) throw new ProviderError(`Ollama returned an error (${res.status}).`);
    return res;
  }

  async json(system: string, user: string, schema: z.ZodType, signal: AbortSignal): Promise<unknown> {
    const res = await this.post(
      {
        model: this.model,
        stream: false,
        format: z.toJSONSchema(schema),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      signal,
    );
    const body = (await res.json()) as { message?: { content?: string }; error?: string };
    if (body.error) throw new ProviderError(`Ollama: ${body.error}`);
    try {
      return JSON.parse(body.message?.content ?? "");
    } catch {
      throw new ProviderError("The local model's visualization wasn't valid JSON. Try again, or use a bigger model.");
    }
  }
}
