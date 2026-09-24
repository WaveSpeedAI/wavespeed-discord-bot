import { describe, it, expect } from 'vitest';
import { execute as imagine } from './imagine.js';
import { execute as animate } from './animate.js';
import { execute as models } from './models.js';
import { execute as balance } from './balance.js';
import { RateLimiter } from '../lib/rate-limit.js';
import { fakeConfig, fakeGateway, fakeInteraction } from '../test-helpers.js';
import type { CommandContext } from './context.js';

function ctx(gateway = fakeGateway()): CommandContext & { gateway: ReturnType<typeof fakeGateway> } {
  return {
    config: fakeConfig(),
    gateway,
    limiter: new RateLimiter(10, 60_000, 10),
    attachOutputs: false,
  };
}

describe('/imagine', () => {
  it('uses the configured default image model', async () => {
    const interaction = fakeInteraction({ strings: { prompt: 'a red fox' } });
    const context = ctx();
    await imagine(interaction, context);
    expect(context.gateway.generate).toHaveBeenCalledWith('bytedance/seedream-v5.0-pro', {
      prompt: 'a red fox',
    });
  });

  it('honours an explicit model and optional parameters', async () => {
    const interaction = fakeInteraction({
      strings: { prompt: 'a red fox', model: 'wavespeed-ai/z-image/turbo', aspect_ratio: '16:9' },
      integers: { seed: 7, count: 2 },
    });
    const context = ctx();
    await imagine(interaction, context);
    expect(context.gateway.generate).toHaveBeenCalledWith('wavespeed-ai/z-image/turbo', {
      prompt: 'a red fox',
      aspect_ratio: '16:9',
      seed: 7,
      num_images: 2,
    });
  });

  it('omits unset options rather than sending nulls', async () => {
    const interaction = fakeInteraction({ strings: { prompt: 'x' } });
    const context = ctx();
    await imagine(interaction, context);
    const input = context.gateway.generate.mock.calls[0]![1];
    expect(Object.keys(input)).toEqual(['prompt']);
  });
});

describe('/animate', () => {
  it('defaults to the video model and defers before generating', async () => {
    const interaction = fakeInteraction({ strings: { prompt: 'a drone shot' } });
    const context = ctx();
    await animate(interaction, context);
    expect(context.gateway.generate).toHaveBeenCalledWith('bytedance/seedance-2.5/text-to-video', {
      prompt: 'a drone shot',
    });
    expect(interaction.calls.defer).toHaveLength(1);
  });

  it('passes duration, resolution and a source image through', async () => {
    const interaction = fakeInteraction({
      strings: { prompt: 'p', resolution: '720p', image: 'https://a/in.png' },
      integers: { duration: 5 },
    });
    const context = ctx();
    await animate(interaction, context);
    expect(context.gateway.generate.mock.calls[0]![1]).toEqual({
      prompt: 'p',
      duration: 5,
      resolution: '720p',
      image: 'https://a/in.png',
    });
  });
});

describe('/models', () => {
  it('lists matching models', async () => {
    const gateway = fakeGateway({
      models: [{ model_id: 'bytedance/seedream-v5.0-pro', name: 'Seedream', base_price: 0.03 }],
    });
    const interaction = fakeInteraction({ commandName: 'models', strings: { query: 'seedream' } });
    await models(interaction, ctx(gateway));
    expect(interaction.calls.defer).toHaveLength(1);
    expect(interaction.calls.edit[0]!.embeds![0]!.description).toContain('bytedance/seedream-v5.0-pro');
  });

  it('says so when nothing matches', async () => {
    const interaction = fakeInteraction({ commandName: 'models', strings: { query: 'nope' } });
    await models(interaction, ctx());
    expect(interaction.calls.edit[0]!.embeds![0]!.description).toContain('No models matched');
  });

  it('reports catalog failures instead of throwing', async () => {
    const gateway = fakeGateway();
    gateway.listModels = async () => {
      throw new Error('401 unauthorized');
    };
    const interaction = fakeInteraction({ commandName: 'models', strings: { query: 'x' } });
    await models(interaction, ctx(gateway));
    expect(interaction.calls.edit[0]!.embeds![0]!.title).toBe('Catalog lookup failed');
  });
});

describe('/balance', () => {
  it('answers ephemerally — the balance belongs to the host, not the channel', async () => {
    const interaction = fakeInteraction({ commandName: 'balance' });
    await balance(interaction, ctx());
    expect(interaction.calls.defer[0]).toEqual({ ephemeral: true });
    expect(interaction.calls.edit[0]!.embeds![0]!.description).toContain('12.345678 USD');
  });

  it('reports lookup failures', async () => {
    const gateway = fakeGateway();
    gateway.getBalance = async () => {
      throw new Error('key revoked');
    };
    const interaction = fakeInteraction({ commandName: 'balance' });
    await balance(interaction, ctx(gateway));
    expect(interaction.calls.edit[0]!.embeds![0]!.title).toBe('Balance lookup failed');
  });
});
