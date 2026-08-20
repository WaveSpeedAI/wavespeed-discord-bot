import { describe, it, expect, vi } from 'vitest';
import { buildResultPayload, downloadOutput, truncate } from './render.js';
import { fakeOutcome } from '../test-helpers.js';

function response(body: Uint8Array, headers: Record<string, string> = {}, ok = true): Response {
  return {
    ok,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    arrayBuffer: async () => body.buffer,
  } as unknown as Response;
}

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('short', 10)).toBe('short');
  });
  it('adds an ellipsis when clipping', () => {
    expect(truncate('abcdefgh', 4)).toBe('abc…');
  });
});

describe('downloadOutput', () => {
  it('attaches a small file with a name derived from the URL', async () => {
    const fetcher = vi.fn(async () => response(new Uint8Array([1, 2, 3]), { 'content-length': '3' }));
    const file = await downloadOutput('https://cdn.example/out.png', 0, 1024, fetcher as never);
    expect(file?.name).toBe('out.png');
    expect(file?.attachment.byteLength).toBe(3);
  });

  it('skips assets that declare a size over the limit', async () => {
    const fetcher = vi.fn(async () =>
      response(new Uint8Array(0), { 'content-length': String(50 * 1024 * 1024) }),
    );
    expect(await downloadOutput('https://cdn.example/big.mp4', 0, 1024, fetcher as never)).toBeNull();
  });

  it('skips assets that turn out to be too large without a header', async () => {
    const fetcher = vi.fn(async () => response(new Uint8Array(2048)));
    expect(await downloadOutput('https://cdn.example/x.mp4', 0, 1024, fetcher as never)).toBeNull();
  });

  it('returns null on a fetch failure instead of throwing', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('DNS');
    });
    expect(await downloadOutput('https://cdn.example/x.png', 0, 1024, fetcher as never)).toBeNull();
  });
});

describe('buildResultPayload', () => {
  it('falls back to a link when the asset cannot be attached', async () => {
    const fetcher = vi.fn(async () => response(new Uint8Array(0), {}, false));
    const payload = await buildResultPayload(fakeOutcome(), { fetcher: fetcher as never });
    expect(payload.files).toBeUndefined();
    const embed = payload.embeds![0]!;
    expect(embed.image?.url).toBe('https://cdn.example.invalid/out.png');
    expect(embed.fields!.some((f) => f.name === 'Result')).toBe(true);
  });

  it('links every output when there is more than one', async () => {
    const outcome = fakeOutcome({ outputs: ['https://a/1.png', 'https://a/2.png'] });
    const payload = await buildResultPayload(outcome, { attach: false });
    expect(payload.embeds![0]!.fields!.some((f) => f.name === 'Outputs')).toBe(true);
  });

  it('mentions the user when delivering out of band', async () => {
    const payload = await buildResultPayload(fakeOutcome(), { attach: false, mention: '<@u1>' });
    expect(payload.content).toBe('<@u1>');
  });

  it('never attaches anything for a failed prediction', async () => {
    const payload = await buildResultPayload(
      fakeOutcome({ status: 'failed', outputs: [], error: 'boom' }),
    );
    expect(payload.files).toBeUndefined();
    expect(payload.embeds![0]!.title).toBe('Generation failed');
  });
});
