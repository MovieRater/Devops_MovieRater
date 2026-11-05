import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiClient, HunchDraft, HunchInput, RecommendDraft, RecommendInput } from './aiClient';
import { HUNCH_SCHEMA, PICKS_SCHEMA, SYSTEM, hunchPrompt, recommendPrompt } from './prompts';

const POLL_MS = 500;
const TIMEOUT_MS = 5 * 60_000;

/**
 * Prototype mode without an API key: a Claude Code session answers the prompts by hand.
 * Each request is written to <dir>/<id>.request.json (system prompt, prompt, JSON schema).
 * The session writes the answer to <dir>/<id>.response.json, as JSON matching the schema.
 */
export class RelayClient implements AiClient {
  readonly mode = 'relay' as const;
  private counter = 0;

  constructor(private dir: string) {}

  private async ask<T>(kind: string, prompt: string, schema: object): Promise<T> {
    await mkdir(this.dir, { recursive: true });
    const id = `${Date.now()}-${++this.counter}-${kind}`;
    const requestFile = join(this.dir, `${id}.request.json`);
    const responseFile = join(this.dir, `${id}.response.json`);
    await writeFile(requestFile, JSON.stringify({ id, kind, system: SYSTEM, prompt, schema }, null, 2));

    const deadline = Date.now() + TIMEOUT_MS;
    try {
      while (Date.now() < deadline) {
        const text = await readFile(responseFile, 'utf8').catch(() => null);
        if (text) {
          try {
            return JSON.parse(text) as T;
          } catch {
            /* still being written: try again */
          }
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      throw new Error('No answer from the Claude Code relay within 5 minutes');
    } finally {
      await rm(requestFile, { force: true });
      await rm(responseFile, { force: true });
    }
  }

  async proposeHunches(input: HunchInput): Promise<HunchDraft[]> {
    return (await this.ask<{ hunches: HunchDraft[] }>('hunches', hunchPrompt(input), HUNCH_SCHEMA)).hunches;
  }

  async recommend(input: RecommendInput): Promise<RecommendDraft> {
    return this.ask<RecommendDraft>('picks', recommendPrompt(input), PICKS_SCHEMA);
  }
}
