// /imagine — text-to-image.

import type { CommandInteraction } from '../lib/interaction.js';
import { runGenerationCommand, type CommandContext } from './context.js';

export const ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2'] as const;

export function buildImagineInput(
  interaction: CommandInteraction,
): { input: Record<string, unknown>; prompt: string } | null {
  const prompt = interaction.getString('prompt');
  if (!prompt) return null;

  const input: Record<string, unknown> = { prompt };

  const aspectRatio = interaction.getString('aspect_ratio');
  if (aspectRatio) input.aspect_ratio = aspectRatio;

  const seed = interaction.getInteger('seed');
  if (seed !== null) input.seed = seed;

  const count = interaction.getInteger('count');
  if (count !== null) input.num_images = count;

  return { input, prompt };
}

export async function execute(
  interaction: CommandInteraction,
  ctx: CommandContext,
): Promise<void> {
  const built = buildImagineInput(interaction);
  if (!built) return;
  const model = interaction.getString('model') || ctx.config.defaultImageModel;
  await runGenerationCommand(interaction, ctx, {
    model,
    input: built.input,
    prompt: built.prompt,
  });
}
