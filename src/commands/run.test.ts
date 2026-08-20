import { describe, it, expect } from 'vitest';
import { execute, parseJsonInput } from './run.js';
import { fakeConfig, fakeGateway, fakeInteraction } from '../test-helpers.js';
import { RateLimiter } from '../lib/rate-limit.js';

function ctx(overrides: Partial<ReturnType<typeof fakeConfig>> = {}) {
  const config = fakeConfig(overrides);
  return {
    config,
    gateway: fakeGateway(),
    limiter: new RateLimiter(config.rateLimitPerUser, config.rateLimitWindowMs, config.maxConcurrentJobs),
    attachOutputs: false,
  };
}

describe('parseJsonInput', () => {
  it('accepts a JSON object', () => {
    expect(parseJsonInput('{"prompt":"a red fox"}')).toEqual({
      ok: true,
      value: { prompt: 'a red fox' },
    });
  });

  it('treats blank input as an empty object', () => {
    expect(parseJsonInput('   ')).toEqual({ ok: true, value: {} });
    expect(parseJsonInput(null)).toEqual({ ok: true, value: {} });
  });

  it('rejects malformed JSON with an actionable message', () => {
    const result = parseJsonInput('{prompt: "unquoted"}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not valid JSON');
  });

  it('rejects a truncated object', () => {
    expect(parseJsonInput('{"prompt": "cat"').ok).toBe(false);
  });

  it('rejects arrays and scalars', () => {
    for (const raw of ['[1,2,3]', '"just a string"', '42', 'null', 'true']) {
      const result = parseJsonInput(raw);
      expect(result.ok, raw).toBe(false);
      if (!result.ok) expect(result.error).toContain('JSON object');
    }
  });
});

describe('/run', () => {
  it('rejects malformed JSON ephemerally without spending credit', async () => {
    const interaction = fakeInteraction({
      commandName: 'run',
      strings: { model: 'wavespeed-ai/z-image/turbo', inputs: '{oops}' },
    });
    const context = ctx();
    await execute(interaction, context);

    expect(context.gateway.generate).not.toHaveBeenCalled();
    expect(interaction.calls.defer).toHaveLength(0);
    expect(interaction.calls.ephemeral).toHaveLength(1);
    expect(interaction.calls.ephemeral[0]!.embeds![0]!.title).toBe('Invalid inputs');
  });

  it('forwards a valid JSON object verbatim to the SDK', async () => {
    const interaction = fakeInteraction({
      commandName: 'run',
      strings: {
        model: 'wavespeed-ai/z-image/turbo',
        inputs: '{"prompt":"a red fox","size":"1024*1024"}',
      },
    });
    const context = ctx();
    await execute(interaction, context);

    expect(context.gateway.generate).toHaveBeenCalledWith('wavespeed-ai/z-image/turbo', {
      prompt: 'a red fox',
      size: '1024*1024',
    });
    expect(interaction.calls.defer).toHaveLength(1);
    expect(interaction.calls.edit[1]!.embeds![0]!.title).toBe('Done');
  });
});
