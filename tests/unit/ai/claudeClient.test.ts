import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeClient } from '../../../server/ai/claudeClient';
import { HUNCH_SCHEMA, PICKS_SCHEMA, SYSTEM } from '../../../server/ai/prompts';
import type { RecommendInput } from '../../../server/ai/aiClient';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { beta = { messages: { create } }; },
}));

const input: RecommendInput = {
  clues: [{ title: 'Arrival', year: 2016, genres: ['Science Fiction'], director: 'Denis Villeneuve', verdict: 'super' }],
  patterns: [{ label: 'Thoughtful science fiction', status: 'confirmed' }],
  vibe: { choices: ['calm'], refineChips: ['short'], refineText: 'Something hopeful' },
  reactions: [{ title: 'Alien', year: 1979, genres: ['Horror'], reaction: 'down' }],
};
const respond = (value: unknown) => create.mockResolvedValue({
  stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: 'internal' }, { type: 'text', text: JSON.stringify(value) }],
});

beforeEach(() => { create.mockReset(); });

describe('ClaudeClient', () => {
  it('requests structured hunches and extracts them from the text block', async () => {
    const hunches = [{ label: 'Slow mysteries', basis: 'You liked Arrival', films: [] }];
    respond({ hunches });
    const client = new ClaudeClient();
    expect(client.mode).toBe('claude');
    expect(await client.proposeHunches({ clues: input.clues })).toEqual(hunches);
    expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: HUNCH_SCHEMA } },
      messages: [{ role: 'user', content: expect.stringContaining('Arrival (2016; Science Fiction, dir. Denis Villeneuve): SUPER LIKE') }],
    }));
  });

  it('sends taste, vibe, patterns and reactions with the recommendation schema', async () => {
    const draft = { picks: [{ title: 'Contact', year: 1997, reason: 'A thoughtful mystery.' }], note: { relevant: true, understood: 'hopeful' } };
    respond(draft);
    expect(await new ClaudeClient().recommend(input)).toEqual(draft);
    const request = create.mock.calls[0][0];
    expect(request.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: PICKS_SCHEMA } });
    const prompt = request.messages[0].content;
    for (const part of ['Arrival', 'Thoughtful science fiction: confirmed', 'calm, short', '<user_note>Something hopeful</user_note>', 'Alien (1979; Horror): not interested']) {
      expect(prompt).toContain(part);
    }
  });

  it('trims and limits the free-text preference sent to Claude', async () => {
    respond({ picks: [], note: { relevant: true, understood: '' } });
    await new ClaudeClient().recommend({ ...input, vibe: { ...input.vibe, refineText: `  ${'x'.repeat(350)}  ` } });
    expect(create.mock.calls[0][0].messages[0].content).toContain(`<user_note>${'x'.repeat(300)}</user_note>`);
  });

  it.each([
    ['refusal', 'Claude declined the request'],
    ['max_tokens', 'Claude ran out of output tokens'],
  ])('rejects %s even if a text block exists', async (stop_reason, message) => {
    create.mockResolvedValue({ stop_reason, content: [{ type: 'text', text: '{"hunches":[]}' }] });
    await expect(new ClaudeClient().proposeHunches({ clues: [] })).rejects.toThrow(message);
  });

  it('rejects a response without text', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [] });
    await expect(new ClaudeClient().recommend(input)).rejects.toThrow('Claude returned no text');
  });

  it('rejects malformed JSON', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not JSON' }] });
    await expect(new ClaudeClient().recommend(input)).rejects.toBeInstanceOf(SyntaxError);
  });

  it('propagates SDK failures', async () => {
    const error = new Error('Rate limit exceeded');
    create.mockRejectedValue(error);
    await expect(new ClaudeClient().recommend(input)).rejects.toThrow('Rate limit exceeded');
  });
});
