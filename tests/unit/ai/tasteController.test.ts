import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasteController } from '../../../server/ai/tasteController';
import { TasteService } from '../../../server/ai/tasteService';
import { TmdbRepository } from '../../../server/ai/tmdbRepository';
import type { AiClient } from '../../../server/ai/aiClient';

function setup() {
  const ai = {
    mode: 'claude',
    proposeHunches: vi.fn<AiClient['proposeHunches']>().mockResolvedValue([]),
    recommend: vi.fn<AiClient['recommend']>().mockResolvedValue({ picks: [], note: { relevant: true, understood: '' } }),
  } satisfies AiClient;
  const handler = tasteController(new TasteService(ai, new TmdbRepository('https://tmdb.invalid', 'test-only'), []));
  async function send(method: string, url: string, body = '') {
    const req = Readable.from([Buffer.from(body)]) as IncomingMessage;
    req.method = method;
    req.url = url;
    const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    await handler(req, res as unknown as ServerResponse);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    return { status: res.statusCode, body: JSON.parse(res.end.mock.calls[0][0]) };
  }
  return { ai, send };
}
const validRequest = { answers: [], hunches: [], reactions: [], vibe: { choices: [], refineChips: [] } };

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('taste HTTP handler with real service', () => {
  it('serves anchors without calling AI', async () => {
    const { ai, send } = setup();
    expect(await send('GET', '/anchors?session=1')).toEqual({ status: 200, body: { mode: 'claude', anchors: [] } });
    expect(ai.proposeHunches).not.toHaveBeenCalled();
    expect(ai.recommend).not.toHaveBeenCalled();
  });

  it('routes hunches and recommendations through the service', async () => {
    const { ai, send } = setup();
    expect(await send('POST', '/hunches', '{"answers":[]}')).toEqual({ status: 200, body: { mode: 'claude', hunches: [] } });
    expect(await send('POST', '/recommendations', JSON.stringify(validRequest))).toEqual({ status: 200, body: { mode: 'claude', picks: [] } });
    expect(ai.proposeHunches).toHaveBeenCalledExactlyOnceWith({ clues: [] });
    expect(ai.recommend).toHaveBeenCalledExactlyOnceWith({ clues: [], patterns: [], reactions: [], vibe: validRequest.vibe });
  });

  it.each([
    ['/hunches', '{', 'Body must be JSON'],
    ['/hunches', '{}', '"answers" must be an array'],
    ['/hunches', '{"answers":{}}', '"answers" must be an array'],
    ['/hunches', JSON.stringify({ answers: Array(301).fill({}) }), '"answers" must be an array'],
    ['/recommendations', '{"answers":[]}', '"hunches" and "vibe" are required'],
    ['/recommendations', JSON.stringify({ ...validRequest, vibe: null }), '"hunches" and "vibe" are required'],
    ['/recommendations', JSON.stringify({ ...validRequest, reactions: undefined }), '"reactions" must be an array'],
    ['/recommendations', JSON.stringify({ ...validRequest, reactions: Array(301).fill({}) }), '"reactions" must be an array'],
  ])('rejects invalid input on %s: %s', async (url, body, error) => {
    const { ai, send } = setup();
    expect(await send('POST', url, body)).toEqual({ status: 400, body: { error } });
    expect(ai.proposeHunches).not.toHaveBeenCalled();
    expect(ai.recommend).not.toHaveBeenCalled();
  });

  it('rejects oversized bodies based on UTF-8 byte length', async () => {
    const { ai, send } = setup();
    expect(await send('POST', '/hunches', JSON.stringify({ answers: [], extra: 'é'.repeat(100_000) }))).toEqual({ status: 413, body: { error: 'Request too large' } });
    expect(ai.proposeHunches).not.toHaveBeenCalled();
  });

  it.each([['GET', '/hunches'], ['POST', '/unknown']])('returns 404 for %s %s', async (method, url) => {
    expect((await setup().send(method, url)).status).toBe(404);
  });

  it.each(['/hunches', '/recommendations'])('returns 502 on AI failure at %s', async (url) => {
    const { ai, send } = setup();
    ai.proposeHunches.mockRejectedValue(new Error('AI unavailable'));
    ai.recommend.mockRejectedValue(new Error('AI unavailable'));
    expect(await send('POST', url, JSON.stringify(validRequest))).toEqual({ status: 502, body: { error: 'AI unavailable' } });
  });
});
