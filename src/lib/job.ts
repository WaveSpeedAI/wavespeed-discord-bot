// Generation job lifecycle — the part that has to get Discord's two timers
// right.
//
// Timer 1: an interaction must be acknowledged within 3 seconds. Every
// generation takes far longer, so the very first thing a handler does is
// `defer()` (discord.js `deferReply`), which turns the command into a
// "thinking…" placeholder we may edit later.
//
// Timer 2: the interaction token dies 15 minutes after the interaction was
// created. Once it does, `editReply`/`followUp` both start returning
// "Unknown Webhook" (10015). So we watch the clock ourselves: at
// TOKEN_SAFETY_MARGIN before expiry we spend the still-valid token on a
// "still generating, I'll post it here" edit, and when the job finally settles
// we deliver the result as a fresh channel message that mentions the user and
// carries the prediction id. If the bot cannot post to the channel (DM,
// missing permission) the outcome is logged with the prediction id so the host
// can recover it.

import type { GenerationOutcome, WaveSpeedGateway } from './wavespeed.js';
import { buildResultPayload, pendingEmbed, stillRunningEmbed, type MessagePayload } from './render.js';

/** Discord interaction tokens are valid for 15 minutes. */
export const TOKEN_LIFETIME_MS = 15 * 60 * 1000;
/** Leave enough room to still land the "still running" edit. */
export const TOKEN_SAFETY_MARGIN_MS = 60 * 1000;

/**
 * Minimal surface the job runner needs from a Discord interaction. Keeping it
 * structural means the handlers are unit-testable with a plain object.
 */
export interface JobTarget {
  /** Acknowledge within 3s. Must be called before any long work. */
  defer(options?: { ephemeral?: boolean }): Promise<void>;
  /** Edit the deferred reply. Only valid while the token lives. */
  edit(payload: MessagePayload): Promise<void>;
  /** Post a new message in the originating channel. Returns false if impossible. */
  sendChannelMessage(payload: MessagePayload): Promise<boolean>;
  userId: string;
  userMention: string;
  /** Interaction creation time — the clock the 15-minute token runs on. */
  createdAt: number;
}

export interface JobRequest {
  model: string;
  input: Record<string, unknown>;
  prompt?: string;
}

export interface JobDeps {
  gateway: WaveSpeedGateway;
  now?: () => number;
  /** Overridable for tests; defaults to the real 15-minute budget. */
  tokenLifetimeMs?: number;
  safetyMarginMs?: number;
  attachOutputs?: boolean;
  log?: (message: string) => void;
}

export interface JobResult {
  outcome: GenerationOutcome;
  /** True when the result had to be delivered outside the interaction token. */
  deliveredOutOfBand: boolean;
}

const timeout = (ms: number): Promise<'expired'> =>
  new Promise((resolve) => {
    const handle = setTimeout(() => resolve('expired'), Math.max(0, ms));
    // Never hold the process open just for the deadline watchdog.
    if (typeof handle.unref === 'function') handle.unref();
  });

/**
 * Defer, run, then edit — with a fallback path when the job outlives the
 * interaction token.
 */
export async function runJob(
  target: JobTarget,
  request: JobRequest,
  deps: JobDeps,
): Promise<JobResult> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string) => console.log(message));
  const lifetime = deps.tokenLifetimeMs ?? TOKEN_LIFETIME_MS;
  const margin = deps.safetyMarginMs ?? TOKEN_SAFETY_MARGIN_MS;

  // Timer 1: acknowledge before anything slow happens.
  await target.defer();
  await target.edit({ embeds: [pendingEmbed(request.model, request.prompt)] }).catch(() => {
    /* a failed cosmetic edit must not abort the generation */
  });

  const work = deps.gateway.generate(request.model, request.input);

  // Timer 2: how long the token has left, measured from interaction creation.
  const deadlineMs = target.createdAt + lifetime - margin - now();
  const race = await Promise.race([work.then(() => 'done' as const), timeout(deadlineMs)]);

  if (race === 'done') {
    const outcome = await work;
    const payload = await buildResultPayload(outcome, {
      prompt: request.prompt,
      attach: deps.attachOutputs,
    });
    await target.edit(payload);
    return { outcome, deliveredOutOfBand: false };
  }

  // Token is about to expire. Spend it on a status edit, then follow up in the
  // channel once the job settles.
  await target.edit({ embeds: [stillRunningEmbed(request.model)] }).catch(() => {
    /* token may already be gone; the channel message below is the real path */
  });

  const outcome = await work;
  const payload = await buildResultPayload(outcome, {
    prompt: request.prompt,
    mention: target.userMention,
    attach: deps.attachOutputs,
  });
  const delivered = await target.sendChannelMessage(payload).catch(() => false);
  if (!delivered) {
    log(
      `[job] could not deliver result to user ${target.userId}; ` +
        `prediction ${outcome.predictionId} finished with status ${outcome.status}` +
        (outcome.outputs[0] ? ` -> ${outcome.outputs[0]}` : ''),
    );
  }
  return { outcome, deliveredOutOfBand: true };
}
