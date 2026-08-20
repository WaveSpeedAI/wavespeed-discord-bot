// /animate — text-to-video.

import type { CommandInteraction } from '../lib/interaction.js';
import { runGenerationCommand, type CommandContext } from './context.js';

export function buildAnimateInput(
  interaction: CommandInteraction,
): { input: Record<string, unknown>; prompt: string } | null {
  const prompt = interaction.getString('prompt');
  if (!prompt) return null;

  const input: Record<string, unknown> = { prompt };

  const duration = interaction.getInteger('duration');
  if (duration !== null) input.duration = duration;

  const resolution = interaction.getString('resolution');
  if (resolution) input.resolution = resolution;

  const image = interaction.getString('image');
  if (image) input.image = image;

  const seed = interaction.getInteger('seed');
  if (seed !== null) input.seed = seed;

  return { input, prompt };
}

export async function execute(
  interaction: CommandInteraction,
  ctx: CommandContext,
): Promise<void> {
  const built = buildAnimateInput(interaction);
  if (!built) return;
  const model = interaction.getString('model') || ctx.config.defaultVideoModel;
  await runGenerationCommand(interaction, ctx, {
    model,
    input: built.input,
    prompt: built.prompt,
  });
}
