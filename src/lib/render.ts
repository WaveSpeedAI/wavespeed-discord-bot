// Message rendering.
//
// Payloads are plain JSON (raw embeds + attachment payloads) rather than
// discord.js builders. discord.js accepts both, and plain objects keep the
// command handlers trivially unit-testable without a gateway connection.

import type { GenerationOutcome } from './wavespeed.js';

export const COLOR_PENDING = 0x5865f2;
export const COLOR_SUCCESS = 0x2ecc71;
export const COLOR_FAILURE = 0xe74c3c;
export const COLOR_INFO = 0x9b59b6;

/** Discord's attachment ceiling for a non-boosted server, minus headroom. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  title?: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  image?: { url: string };
  footer?: { text: string };
}

export interface FilePayload {
  attachment: Buffer;
  name: string;
}

export interface MessagePayload {
  content?: string;
  embeds?: Embed[];
  files?: FilePayload[];
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function pendingEmbed(model: string, prompt: string | undefined): Embed {
  return {
    title: 'Generating…',
    description: prompt ? truncate(prompt, 500) : undefined,
    color: COLOR_PENDING,
    fields: [{ name: 'Model', value: `\`${model}\``, inline: true }],
    footer: { text: 'Powered by WaveSpeed' },
  };
}

/**
 * Reply shown when the interaction token is about to expire while the job is
 * still running. The prediction id is deliberately absent here: the WaveSpeed
 * SDK only surfaces the task id once the prediction reaches a terminal state,
 * so the id is delivered with the follow-up message instead.
 */
export function stillRunningEmbed(model: string): Embed {
  return {
    title: 'Still generating…',
    description:
      'This job is taking longer than Discord allows me to keep editing this reply ' +
      '(15 minutes). I will post the result in this channel and mention you when it lands.',
    color: COLOR_PENDING,
    fields: [{ name: 'Model', value: `\`${model}\``, inline: true }],
    footer: { text: 'Powered by WaveSpeed' },
  };
}

export function resultEmbed(outcome: GenerationOutcome, prompt?: string): Embed {
  const fields: EmbedField[] = [
    { name: 'Model', value: `\`${outcome.model}\``, inline: true },
    { name: 'Prediction ID', value: `\`${outcome.predictionId}\``, inline: true },
  ];

  if (outcome.status === 'completed' && outcome.outputs.length > 0) {
    if (outcome.outputs.length > 1) {
      fields.push({
        name: 'Outputs',
        value: outcome.outputs.map((url, i) => `[${i + 1}](${url})`).join(' · '),
      });
    }
    return {
      title: 'Done',
      description: prompt ? truncate(prompt, 500) : undefined,
      color: COLOR_SUCCESS,
      fields,
      footer: { text: 'Powered by WaveSpeed' },
    };
  }

  if (outcome.status === 'processing') {
    return {
      title: 'Still processing',
      description:
        'The prediction has not finished yet. Look it up later with the prediction id below.',
      color: COLOR_PENDING,
      fields,
      footer: { text: 'Powered by WaveSpeed' },
    };
  }

  return {
    title: 'Generation failed',
    description: truncate(outcome.error || 'The prediction did not complete.', 1000),
    color: COLOR_FAILURE,
    fields,
    footer: { text: 'Powered by WaveSpeed' },
  };
}

export function errorEmbed(title: string, message: string): Embed {
  return { title, description: truncate(message, 1000), color: COLOR_FAILURE };
}

export function infoEmbed(title: string, message: string): Embed {
  return { title, description: truncate(message, 4000), color: COLOR_INFO };
}

function filenameFor(url: string, index: number): string {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split('/').filter(Boolean).pop();
    if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
  } catch {
    /* fall through to a generic name */
  }
  return `output-${index + 1}.bin`;
}

export type Fetcher = typeof fetch;

/**
 * Download an output so it can be attached to the message. Returns null when
 * the asset is too large or unreachable — callers then fall back to a link,
 * which is always present in the embed anyway.
 */
export async function downloadOutput(
  url: string,
  index: number,
  maxBytes = MAX_ATTACHMENT_BYTES,
  fetcher: Fetcher = fetch,
): Promise<FilePayload | null> {
  try {
    const res = await fetcher(url);
    if (!res.ok) return null;
    const declared = Number(res.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > maxBytes) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) return null;
    return { attachment: buffer, name: filenameFor(url, index) };
  } catch {
    return null;
  }
}

/** Build the final message for a settled generation. */
export async function buildResultPayload(
  outcome: GenerationOutcome,
  options: {
    prompt?: string;
    mention?: string;
    maxBytes?: number;
    fetcher?: Fetcher;
    /** Attach outputs as files. Disabled in tests that only assert structure. */
    attach?: boolean;
  } = {},
): Promise<MessagePayload> {
  const embed = resultEmbed(outcome, options.prompt);
  const payload: MessagePayload = {
    embeds: [embed],
    content: options.mention,
  };

  if (outcome.status !== 'completed' || outcome.outputs.length === 0) {
    return payload;
  }

  const files: FilePayload[] = [];
  if (options.attach !== false) {
    const downloads = await Promise.all(
      outcome.outputs
        .slice(0, 4)
        .map((url, index) => downloadOutput(url, index, options.maxBytes, options.fetcher)),
    );
    for (const file of downloads) {
      if (file) files.push(file);
    }
  }

  if (files.length > 0) {
    payload.files = files;
  } else {
    // Nothing could be attached (too large, or download failed) — make sure the
    // user still gets a clickable result.
    const first = outcome.outputs[0];
    if (first) embed.image = { url: first };
    embed.fields = [
      ...(embed.fields ?? []),
      { name: 'Result', value: outcome.outputs.map((url, i) => `[Download ${i + 1}](${url})`).join(' · ') },
    ];
  }

  return payload;
}
