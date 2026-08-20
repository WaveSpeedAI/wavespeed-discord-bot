// /models — search the live WaveSpeed catalog.

import type { CommandInteraction } from '../lib/interaction.js';
import { errorEmbed, infoEmbed, truncate } from '../lib/render.js';
import { searchModels, type CatalogModel } from '../lib/wavespeed.js';
import type { CommandContext } from './context.js';

export const MAX_RESULTS = 10;

export function formatResults(models: CatalogModel[], query: string): string {
  if (models.length === 0) {
    return `No models matched \`${query}\`. Browse the full catalog at https://wavespeed.ai/models`;
  }
  const lines = models.slice(0, MAX_RESULTS).map((model) => {
    const price = typeof model.base_price === 'number' ? ` — $${model.base_price}` : '';
    const description = model.description ? `\n  ${truncate(model.description, 120)}` : '';
    return `**\`${model.model_id}\`**${price}${description}`;
  });
  if (models.length > MAX_RESULTS) {
    lines.push(`\n…and ${models.length - MAX_RESULTS} more. Narrow the query to see them.`);
  }
  return lines.join('\n');
}

export async function execute(
  interaction: CommandInteraction,
  ctx: CommandContext,
): Promise<void> {
  const query = interaction.getString('query') ?? '';
  const type = interaction.getString('type') ?? undefined;

  await interaction.defer();
  try {
    const catalog = await ctx.gateway.listModels();
    const matches = searchModels(catalog, query, type);
    await interaction.edit({
      embeds: [infoEmbed(query ? `Models matching "${query}"` : 'Models', formatResults(matches, query))],
    });
  } catch (error) {
    await interaction.edit({
      embeds: [errorEmbed('Catalog lookup failed', (error as Error).message)],
    });
  }
}
