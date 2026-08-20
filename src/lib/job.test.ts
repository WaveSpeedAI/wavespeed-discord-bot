import { describe, it, expect, vi } from 'vitest';
import { runJob, TOKEN_LIFETIME_MS } from './job.js';
import { fakeGateway, fakeInteraction, fakeOutcome } from '../test-helpers.js';

describe('runJob — defer then edit', () => {
  it('defers before doing any work, then edits with the result', async () => {
    const order: string[] = [];
    const interaction = fakeInteraction();
    const originalDefer = interaction.defer.bind(interaction);
    interaction.defer = async (opts) => {
      order.push('defer');
      await originalDefer(opts);
    };

    const gateway = fakeGateway({
      generate: vi.fn(async () => {
        order.push('generate');
        return fakeOutcome();
      }),
    });

    const result = await runJob(
      interaction,
      { model: 'm', input: { prompt: 'cat' }, prompt: 'cat' },
      { gateway, attachOutputs: false },
    );

    expect(order).toEqual(['defer', 'generate']);
    expect(interaction.calls.defer).toHaveLength(1);
    // First edit is the "Generating…" placeholder, second carries the result.
    expect(interaction.calls.edit).toHaveLength(2);
    expect(interaction.calls.edit[0]!.embeds![0]!.title).toBe('Generating…');
    expect(interaction.calls.edit[1]!.embeds![0]!.title).toBe('Done');
    expect(result.deliveredOutOfBand).toBe(false);
    expect(interaction.calls.channel).toHaveLength(0);
  });

  it('always shows the prediction id so a job can be recovered', async () => {
    const interaction = fakeInteraction();
    await runJob(
      interaction,
      { model: 'm', input: {} },
      { gateway: fakeGateway(), attachOutputs: false },
    );
    const fields = interaction.calls.edit[1]!.embeds![0]!.fields ?? [];
    expect(fields.some((f) => f.name === 'Prediction ID' && f.value.includes('pred-abc123'))).toBe(
      true,
    );
  });

  it('never calls generate before the interaction is acknowledged', async () => {
    let deferred = false;
    const interaction = fakeInteraction();
    interaction.defer = async () => {
      deferred = true;
    };
    const gateway = fakeGateway({
      generate: vi.fn(async () => {
        expect(deferred).toBe(true);
        return fakeOutcome();
      }),
    });
    await runJob(interaction, { model: 'm', input: {} }, { gateway, attachOutputs: false });
    expect(gateway.generate).toHaveBeenCalledTimes(1);
  });
});

describe('runJob — terminal statuses', () => {
  it('reports a failed prediction with its error and id', async () => {
    const interaction = fakeInteraction();
    const gateway = fakeGateway({
      outcome: fakeOutcome({
        status: 'failed',
        outputs: [],
        error: 'Prediction failed: NSFW content detected',
      }),
    });

    const result = await runJob(
      interaction,
      { model: 'm', input: {} },
      { gateway, attachOutputs: false },
    );

    const embed = interaction.calls.edit[1]!.embeds![0]!;
    expect(embed.title).toBe('Generation failed');
    expect(embed.description).toContain('NSFW content detected');
    expect(embed.fields!.some((f) => f.value.includes('pred-abc123'))).toBe(true);
    expect(result.outcome.status).toBe('failed');
  });

  it('treats a cancelled prediction as a failure, not a hang', async () => {
    const interaction = fakeInteraction();
    const gateway = fakeGateway({
      outcome: fakeOutcome({ status: 'failed', outputs: [], error: 'Task cancelled' }),
    });
    await runJob(interaction, { model: 'm', input: {} }, { gateway, attachOutputs: false });
    expect(interaction.calls.edit[1]!.embeds![0]!.description).toContain('cancelled');
  });

  it('surfaces a still-processing prediction with its id', async () => {
    const interaction = fakeInteraction();
    const gateway = fakeGateway({
      outcome: fakeOutcome({ status: 'processing', outputs: [] }),
    });
    await runJob(interaction, { model: 'm', input: {} }, { gateway, attachOutputs: false });
    expect(interaction.calls.edit[1]!.embeds![0]!.title).toBe('Still processing');
  });
});

describe('runJob — 15-minute interaction token expiry', () => {
  it('falls back to a channel message when the job outlives the token', async () => {
    const interaction = fakeInteraction();
    let settle: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const gateway = fakeGateway({
      generate: async () => {
        await gate;
        return fakeOutcome();
      },
    });

    const promise = runJob(
      interaction,
      { model: 'm', input: {}, prompt: 'slow' },
      { gateway, attachOutputs: false, tokenLifetimeMs: 30, safetyMarginMs: 10 },
    );

    // Let the deadline win the race, then let the job finish.
    await new Promise((resolve) => setTimeout(resolve, 50));
    settle!();
    const result = await promise;

    expect(result.deliveredOutOfBand).toBe(true);
    const titles = interaction.calls.edit.map((p) => p.embeds![0]!.title);
    expect(titles).toEqual(['Generating…', 'Still generating…']);
    expect(interaction.calls.channel).toHaveLength(1);
    const followUp = interaction.calls.channel[0]!;
    expect(followUp.content).toBe('<@user-1>');
    expect(followUp.embeds![0]!.fields!.some((f) => f.value.includes('pred-abc123'))).toBe(true);
  });

  it('logs the prediction id when the channel cannot be posted to', async () => {
    const interaction = fakeInteraction({ channelSendable: false });
    const logged: string[] = [];
    await runJob(
      interaction,
      { model: 'm', input: {} },
      {
        gateway: fakeGateway({
          generate: async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return fakeOutcome();
          },
        }),
        attachOutputs: false,
        tokenLifetimeMs: 0,
        safetyMarginMs: 0,
        log: (m) => logged.push(m),
      },
    );
    expect(logged.join('\n')).toContain('pred-abc123');
  });

  it('uses a 15 minute token budget by default', () => {
    expect(TOKEN_LIFETIME_MS).toBe(15 * 60 * 1000);
  });
});
