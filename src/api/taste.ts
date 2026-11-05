import type {
  AnchorsResponse, HunchesRequest, HunchesResponse, RecommendationsRequest, RecommendationsResponse,
} from '@/models/taste';

// Talks to the local taste API (server/ai), served by the Vite dev server.
const BASE = '/api/taste';

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Taste API failed (${res.status})`);
  return data as T;
}

export const fetchAnchors = () => call<AnchorsResponse>('anchors');
export const fetchHunches = (req: HunchesRequest) => call<HunchesResponse>('hunches', req);
export const fetchRecommendations = (req: RecommendationsRequest) =>
  call<RecommendationsResponse>('recommendations', req);
