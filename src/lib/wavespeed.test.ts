import { describe, it, expect, afterEach, vi } from 'vitest';
import { attributionHeaders, createGateway, searchModels, toUrls } from './wavespeed.js';
import { fakeConfig } from '../test-helpers.js';
import { resultEmbed } from './render.js';
import { CLIENT_NAME } from '../config.js';

const ORIGINAL = process.env.WAVESPEED_CLIENT_NAME;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.WAVESPEED_CLIENT_NAME;
  else process.env.WAVESPEED_CLIENT_NAME = ORIGINAL;
});

describe('attributionHeaders', () => {
  it('identifies the bot to the WaveSpeed API', () => {
    delete process.env.WAVESPEED_CLIENT_NAME;
    const headers = attributionHeaders();
    expect(headers['X-Client-Name']).toBe(CLIENT_NAME);
    expect(CLIENT_NAME).toBe('wavespeed-discord-bot');
    expect(headers['X-Client-Version']).toMatch(/^\d+\.\d+\.\d+/);
    expect(['darwin', 'linux', 'windows']).toContain(headers['X-Client-OS']);
  });

  it('honours a WAVESPEED_CLIENT_NAME override', () => {
    process.env.WAVESPEED_CLIENT_NAME = 'downstream-fork';
    expect(attributionHeaders()['X-Client-Name']).toBe('downstream-fork');
  });
});

describe('toUrls', () => {
  it('accepts plain string outputs', () => {
    expect(toUrls(['https://a/1.png'])).toEqual(['https://a/1.png']);
  });
  it('accepts objects carrying a url', () => {
    expect(toUrls([{ url: 'https://a/2.mp4' }])).toEqual(['https://a/2.mp4']);
  });
  it('drops anything unusable', () => {
    expect(toUrls([null, 42, { nope: true }, 'https://a/3.png'])).toEqual(['https://a/3.png']);
    expect(toUrls(null)).toEqual([]);
  });
});

const catalog = [
  { model_id: 'bytedance/seedream-v5.0-pro', name: 'Seedream v5 Pro', type: 'image' },
  { model_id: 'bytedance/seedance-2.5/text-to-video', name: 'Seedance 2.5', type: 'video' },
  { model_id: 'wavespeed-ai/z-image/turbo', name: 'Z-Image Turbo', description: 'fast image model', type: 'image' },
];

describe('searchModels', () => {
  it('ranks an exact model id first', () => {
    const results = searchModels(catalog, 'wavespeed-ai/z-image/turbo');
    expect(results[0]!.model_id).toBe('wavespeed-ai/z-image/turbo');
  });

  it('matches substrings of the id', () => {
    expect(searchModels(catalog, 'seed').map((m) => m.model_id)).toHaveLength(2);
  });

  it('matches names and descriptions', () => {
    expect(searchModels(catalog, 'turbo')[0]!.model_id).toBe('wavespeed-ai/z-image/turbo');
    expect(searchModels(catalog, 'fast')[0]!.model_id).toBe('wavespeed-ai/z-image/turbo');
  });

  it('filters by type', () => {
    expect(searchModels(catalog, '', 'video').map((m) => m.model_id)).toEqual([
      'bytedance/seedance-2.5/text-to-video',
    ]);
  });

  it('returns everything for an empty query', () => {
    expect(searchModels(catalog, '')).toHaveLength(3);
  });

  it('returns nothing when nothing matches', () => {
    expect(searchModels(catalog, 'no-such-model')).toEqual([]);
  });
});

// These drive the real SDK against a stubbed global fetch.
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const submitOk = () => json(200, { code: 200, data: { id: 'task-1' } });
const done = () =>
  json(200, { code: 200, data: { id: 'task-1', status: 'completed', outputs: ['https://x/o.png'] } });

async function run<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

describe('gateway resilience (real SDK, stubbed fetch)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) =>
      handler(String(url), init),
    );
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, gateway: createGateway(fakeConfig()) };
  }
  const isPost = (init: RequestInit) => init.method === 'POST';

  it('poll 502, 502, 200 succeeds', async () => {
    let gets = 0;
    const { gateway } = setup((_url, init) =>
      isPost(init) ? submitOk() : ++gets <= 2 ? json(502, { message: 'bad gateway' }) : done(),
    );
    const outcome = await run(gateway.generate('m/x', { prompt: 'p' }));
    expect(outcome).toMatchObject({ predictionId: 'task-1', status: 'completed', outputs: ['https://x/o.png'] });
    expect(gets).toBe(3);
  });

  it('persistent poll 502 keeps the task id and is flagged as a status-check failure', async () => {
    const { gateway, fetchMock } = setup((_url, init) =>
      isPost(init) ? submitOk() : json(502, { message: 'bad gateway' }),
    );
    const outcome = await run(gateway.generate('m/x', { prompt: 'p' }));
    expect(outcome.predictionId).toBe('task-1');
    expect(outcome.failureKind).toBe('status_check');
    const embed = resultEmbed(outcome);
    expect(embed.title).toBe('Status check failed');
    expect(embed.description).toContain('may still be running');
    expect(JSON.stringify(embed.fields)).toContain('task-1');
    expect(fetchMock.mock.calls.filter(([, i]) => isPost(i as RequestInit))).toHaveLength(1);
  });

  it('does not retry a 401 on poll', async () => {
    let gets = 0;
    const { gateway } = setup((_url, init) => {
      if (isPost(init)) return submitOk();
      gets++;
      return json(401, { message: 'unauthorized' });
    });
    const outcome = await run(gateway.generate('m/x', { prompt: 'p' }));
    expect(gets).toBe(1);
    expect(outcome.status).toBe('failed');
    expect(outcome.predictionId).toBe('task-1');
  });

  it('never retries a failed submit and reports an unknown outcome', async () => {
    const { gateway, fetchMock } = setup(() => json(502, { message: 'bad gateway' }));
    const outcome = await run(gateway.generate('m/x', { prompt: 'p' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome.failureKind).toBe('submit_unknown');
    const embed = resultEmbed(outcome);
    expect(embed.title).toBe('Submission outcome unknown');
    expect(embed.description).toContain('may already exist');
    expect(JSON.stringify(embed.fields)).not.toContain('unknown`');
  });

  it('retries GET /models on 503 and uses a 30s per-request timeout', async () => {
    let n = 0;
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const { gateway, fetchMock } = setup(() =>
      ++n < 3 ? json(503, { message: 'down' }) : json(200, { code: 200, data: [{ model_id: 'a/b' }] }),
    );
    const models = await run(gateway.listModels());
    expect(models).toEqual([{ model_id: 'a/b' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
  });

  it('retries GET /balance on network errors, gives up after 3 tries', async () => {
    const { gateway, fetchMock } = setup(() => {
      throw new TypeError('fetch failed');
    });
    const p = gateway.getBalance().catch((e: Error) => e);
    const err = await run(p);
    expect((err as Error).message).toContain('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry GET on 401', async () => {
    const { gateway, fetchMock } = setup(() => json(401, { message: 'nope' }));
    const err = await run(gateway.getBalance().catch((e: Error) => e));
    expect((err as Error).message).toBe('nope');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
