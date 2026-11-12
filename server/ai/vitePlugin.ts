import type { Plugin } from 'vite';
import { ClaudeClient } from './claudeClient';
import { FakeClient } from './fakeClient';
import { RelayClient } from './relayClient';
import { TmdbRepository } from './tmdbRepository';
import { TasteService } from './tasteService';
import { tasteController } from './tasteController';

/**
 * Local prototype: serves the taste API (/api/taste/*) from the Vite dev server, so the
 * Anthropic key stays server-side. Dev only; the real backend will host these routes later.
 *
 * AI_MODE=claude | relay | fake. Default: claude when ANTHROPIC_API_KEY is set, otherwise fake.
 * relay: prompts go to files in AI_RELAY_DIR (default .ai-relay/) for a Claude Code session to answer.
 */
export function tastePlugin(env: Record<string, string>): Plugin {
  return {
    name: 'movierater-taste-api',
    apply: 'serve',
    configureServer(server) {
      const mode = env.AI_MODE || (env.ANTHROPIC_API_KEY ? 'claude' : 'fake');
      if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY ??= env.ANTHROPIC_API_KEY;
      const tmdb = new TmdbRepository(env.VITE_TMDB_BASE_URL ?? '', env.VITE_TMDB_API_KEY ?? '');
      const ai = mode === 'claude' ? new ClaudeClient()
        : mode === 'relay' ? new RelayClient(env.AI_RELAY_DIR || '.ai-relay')
        : new FakeClient();
      server.middlewares.use('/api/taste', tasteController(new TasteService(ai, tmdb)));
      server.config.logger.info(`  ➜  Taste API: /api/taste (AI: ${ai.mode})`);
    },
  };
}
