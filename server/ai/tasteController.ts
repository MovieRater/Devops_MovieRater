import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HunchesRequest, RecommendationsRequest } from '../../src/models/taste';
import type { TasteService } from './tasteService';

const MAX_BODY_BYTES = 200_000;
const MAX_ANSWERS = 300;

async function readJson<T>(req: IncomingMessage): Promise<T> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function requireAnswers(body: { answers?: unknown }) {
  if (!Array.isArray(body.answers) || body.answers.length > MAX_ANSWERS) {
    throw new HttpError(400, '"answers" must be an array');
  }
}

/** Routes under /api/taste. Connect-style handler, so it plugs into Vite now and a real server later. */
export function tasteController(service: TasteService) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const route = `${req.method} ${req.url?.split('?')[0]}`;
    try {
      switch (route) {
        case 'GET /anchors':
          return send(res, 200, { mode: service.mode, anchors: service.anchors() });
        case 'POST /hunches': {
          const body = await readJson<HunchesRequest>(req);
          requireAnswers(body);
          return send(res, 200, await service.hunches(body.answers));
        }
        case 'POST /recommendations': {
          const body = await readJson<RecommendationsRequest>(req);
          requireAnswers(body);
          if (!Array.isArray(body.hunches) || !body.vibe) throw new HttpError(400, '"hunches" and "vibe" are required');
          if (!Array.isArray(body.reactions) || body.reactions.length > MAX_ANSWERS) {
            throw new HttpError(400, '"reactions" must be an array');
          }
          return send(res, 200, await service.recommendations(body));
        }
        default:
          return send(res, 404, { error: `No route ${route}` });
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 502;
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[taste] ${route} failed:`, message);
      return send(res, status, { error: message });
    }
  };
}
