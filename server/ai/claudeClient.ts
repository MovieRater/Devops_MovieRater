import Anthropic from '@anthropic-ai/sdk';
import type { AiClient, HunchDraft, HunchInput, RecommendDraft, RecommendInput } from './aiClient';
import { HUNCH_SCHEMA, PICKS_SCHEMA, SYSTEM, hunchPrompt, recommendPrompt } from './prompts';

const MODEL = 'claude-opus-5-5';

export class ClaudeClient implements AiClient {
  readonly mode = 'claude' as const;
  private client = new Anthropic(); // reads ANTHROPIC_API_KEY (or an `ant auth login` profile)

  private async askJson<T>(prompt: string, schema: { [key: string]: unknown }, effort: 'low' | 'medium'): Promise<T> {
    const response = await this.client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // On a safety decline, the API re-runs the request on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort, format: { type: 'json_schema', schema } },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') throw new Error('Claude declined the request');
    if (response.stop_reason === 'max_tokens') throw new Error('Claude ran out of output tokens');
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') throw new Error('Claude returned no text');
    return JSON.parse(text.text) as T;
  }

  async proposeHunches(input: HunchInput): Promise<HunchDraft[]> {
    const out = await this.askJson<{ hunches: HunchDraft[] }>(hunchPrompt(input), HUNCH_SCHEMA, 'low');
    return out.hunches;
  }

  async recommend(input: RecommendInput): Promise<RecommendDraft> {
    return this.askJson<RecommendDraft>(recommendPrompt(input), PICKS_SCHEMA, 'medium');
  }
}
