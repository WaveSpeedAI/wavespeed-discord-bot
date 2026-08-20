import { describe, it, expect, afterEach } from 'vitest';
import { attributionHeaders, searchModels, toUrls } from './wavespeed.js';
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
