// /run — any model id with a raw JSON input object.

import type { CommandInteraction } from '../lib/interaction.js';
import { errorEmbed } from '../lib/render.js';
import { runGenerationCommand, type CommandContext } from './context.js';

export type ParsedInput =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Parse the `input` option. Must be a JSON *object* — arrays, scalars and
 * syntax errors are all rejected with a message the user can act on.
 */
export function parseJsonInput(raw: string | null): ParsedInput {
  const text = (raw ?? '').trim();
  if (!text) return { ok: true, value: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: `That is not valid JSON: ${(error as Error).message}. Example: \`{"prompt": "a red fox"}\``,
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'Inputs must be a JSON object, for example `{"prompt": "a red fox"}`.',
    };
  }

  return { ok: true, value: parsed as Record<string, unknown> };
}

export async function execute(
  interaction: CommandInteraction,
  ctx: CommandContext,
): Promise<void> {
  const model = interaction.getString('model');
  if (!model) {
    await interaction.replyEphemeral({
      embeds: [errorEmbed('Missing model', 'Provide a model id, e.g. `wavespeed-ai/z-image/turbo`.')],
    });
    return;
  }

  const parsed = parseJsonInput(interaction.getString('inputs'));
  if (!parsed.ok) {
    await interaction.replyEphemeral({ embeds: [errorEmbed('Invalid inputs', parsed.error)] });
    return;
  }

  const prompt = typeof parsed.value.prompt === 'string' ? parsed.value.prompt : undefined;
  await runGenerationCommand(interaction, ctx, { model, input: parsed.value, prompt });
}
