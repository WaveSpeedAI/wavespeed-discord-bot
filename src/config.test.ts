import { describe, it, expect } from 'vitest';
import { loadConfig, parseIdList, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from './config.js';

const base = {
  DISCORD_TOKEN: 't',
  DISCORD_CLIENT_ID: 'c',
  WAVESPEED_API_KEY: 'k',
} as NodeJS.ProcessEnv;

describe('parseIdList', () => {
  it('splits on commas and whitespace and deduplicates', () => {
    expect(parseIdList('1, 2 3,,1')).toEqual(['1', '2', '3']);
  });
  it('returns an empty list for undefined', () => {
    expect(parseIdList(undefined)).toEqual([]);
  });
});

describe('loadConfig', () => {
  it('fails loudly on a missing required variable', () => {
    expect(() => loadConfig({ DISCORD_TOKEN: 't' } as NodeJS.ProcessEnv)).toThrow(
      /DISCORD_CLIENT_ID/,
    );
    expect(() => loadConfig({ ...base, WAVESPEED_API_KEY: '' })).toThrow(/WAVESPEED_API_KEY/);
  });

  it('applies the documented defaults', () => {
    const config = loadConfig({ ...base });
    expect(config.defaultImageModel).toBe(DEFAULT_IMAGE_MODEL);
    expect(config.defaultVideoModel).toBe(DEFAULT_VIDEO_MODEL);
    expect(config.wavespeedBaseUrl).toBe('https://api.wavespeed.ai');
    expect(config.rateLimitPerUser).toBe(5);
    expect(config.rateLimitWindowMs).toBe(300_000);
    expect(config.allowedUserIds).toEqual([]);
  });

  it('reads the allowlists and limits from the environment', () => {
    const config = loadConfig({
      ...base,
      RATE_LIMIT_PER_USER: '2',
      RATE_LIMIT_WINDOW_SECONDS: '30',
      ALLOWED_USER_IDS: 'a,b',
      ALLOWED_GUILD_IDS: 'g',
    });
    expect(config.rateLimitPerUser).toBe(2);
    expect(config.rateLimitWindowMs).toBe(30_000);
    expect(config.allowedUserIds).toEqual(['a', 'b']);
    expect(config.allowedGuildIds).toEqual(['g']);
  });

  it('rejects a non-numeric limit', () => {
    expect(() => loadConfig({ ...base, RATE_LIMIT_PER_USER: 'lots' })).toThrow(/positive number/);
  });
});
