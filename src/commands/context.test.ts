import { describe, it, expect } from 'vitest';
import { runGenerationCommand } from './context.js';
import { RateLimiter } from '../lib/rate-limit.js';
import { fakeConfig, fakeGateway, fakeInteraction } from '../test-helpers.js';

describe('runGenerationCommand', () => {
  it('rejects a rate-limited user before submitting anything', async () => {
    const config = fakeConfig({ rateLimitPerUser: 1, rateLimitWindowMs: 60_000 });
    const context = {
      config,
      gateway: fakeGateway(),
      limiter: new RateLimiter(1, 60_000, 10),
      attachOutputs: false,
    };

    const first = fakeInteraction();
    await runGenerationCommand(first, context, { model: 'm', input: {} });

    const second = fakeInteraction();
    const result = await runGenerationCommand(second, context, { model: 'm', input: {} });

    expect(result).toBeNull();
    expect(context.gateway.generate).toHaveBeenCalledTimes(1);
    expect(second.calls.defer).toHaveLength(0);
    expect(second.calls.ephemeral[0]!.embeds![0]!.title).toBe('Slow down');
    expect(second.calls.ephemeral[0]!.embeds![0]!.description).toMatch(/Try again in/);
  });

  it('releases the concurrency slot after each job', async () => {
    const context = {
      config: fakeConfig(),
      gateway: fakeGateway(),
      limiter: new RateLimiter(10, 60_000, 1),
      attachOutputs: false,
    };
    await runGenerationCommand(fakeInteraction(), context, { model: 'm', input: {} });
    await runGenerationCommand(fakeInteraction({ userId: 'u2' }), context, { model: 'm', input: {} });
    expect(context.limiter.activeJobs).toBe(0);
    expect(context.gateway.generate).toHaveBeenCalledTimes(2);
  });

  it('releases the slot even when the job throws', async () => {
    const context = {
      config: fakeConfig(),
      gateway: fakeGateway({
        generate: async () => {
          throw new Error('network down');
        },
      }),
      limiter: new RateLimiter(10, 60_000, 1),
      attachOutputs: false,
    };
    await expect(
      runGenerationCommand(fakeInteraction(), context, { model: 'm', input: {} }),
    ).rejects.toThrow('network down');
    expect(context.limiter.activeJobs).toBe(0);
  });

  it('blocks users outside the allowlist without spending credit', async () => {
    const context = {
      config: fakeConfig({ allowedUserIds: ['someone-else'] }),
      gateway: fakeGateway(),
      limiter: new RateLimiter(10, 60_000, 10),
      attachOutputs: false,
    };
    const interaction = fakeInteraction();
    const result = await runGenerationCommand(interaction, context, { model: 'm', input: {} });

    expect(result).toBeNull();
    expect(context.gateway.generate).not.toHaveBeenCalled();
    expect(interaction.calls.ephemeral[0]!.embeds![0]!.title).toBe('Not allowed');
  });
});
