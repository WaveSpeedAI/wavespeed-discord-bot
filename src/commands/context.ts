// Shared plumbing for every command handler.

import type { BotConfig } from '../config.js';
import { checkAccess } from '../lib/access.js';
import type { CommandInteraction } from '../lib/interaction.js';
import { runJob, type JobRequest, type JobResult } from '../lib/job.js';
import type { RateLimiter } from '../lib/rate-limit.js';
import { errorEmbed } from '../lib/render.js';
import type { WaveSpeedGateway } from '../lib/wavespeed.js';

export interface CommandContext {
  config: BotConfig;
  gateway: WaveSpeedGateway;
  limiter: RateLimiter;
  /** Test seams. */
  now?: () => number;
  attachOutputs?: boolean;
  log?: (message: string) => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)}m`;
}

/**
 * Access check + rate limit + defer/edit job run. Returns the job result, or
 * null when the request was rejected before any credit was spent.
 */
export async function runGenerationCommand(
  interaction: CommandInteraction,
  ctx: CommandContext,
  request: JobRequest,
): Promise<JobResult | null> {
  const access = checkAccess(
    { userId: interaction.userId, guildId: interaction.guildId },
    ctx.config.allowedUserIds,
    ctx.config.allowedGuildIds,
  );
  if (!access.allowed) {
    await interaction.replyEphemeral({ embeds: [errorEmbed('Not allowed', access.message!)] });
    return null;
  }

  const decision = ctx.limiter.tryAcquire(interaction.userId);
  if (!decision.allowed) {
    const message =
      decision.reason === 'global-concurrency'
        ? 'The bot is already running its maximum number of concurrent generations. Try again shortly.'
        : `Rate limit reached. Try again in ${formatDuration(decision.retryAfterMs ?? 0)}.`;
    await interaction.replyEphemeral({ embeds: [errorEmbed('Slow down', message)] });
    return null;
  }

  try {
    return await runJob(interaction, request, {
      gateway: ctx.gateway,
      now: ctx.now,
      attachOutputs: ctx.attachOutputs,
      log: ctx.log,
    });
  } finally {
    ctx.limiter.release();
  }
}
