// /balance — remaining credit on the API key this bot is hosted with.
//
// Deliberately ephemeral: in a shared bot the balance belongs to the host, not
// to whoever ran the command, and it should not be broadcast to a channel.

import type { CommandInteraction } from '../lib/interaction.js';
import { errorEmbed, infoEmbed } from '../lib/render.js';
import type { CommandContext } from './context.js';

export function formatBalance(balance: number, currency: string): string {
  return `**${balance} ${currency}** remaining on the bot owner's WaveSpeed account.\nTop up at https://wavespeed.ai/dashboard`;
}

export async function execute(
  interaction: CommandInteraction,
  ctx: CommandContext,
): Promise<void> {
  await interaction.defer({ ephemeral: true });
  try {
    const { balance, currency } = await ctx.gateway.getBalance();
    await interaction.edit({
      embeds: [infoEmbed('WaveSpeed balance', formatBalance(balance, currency))],
    });
  } catch (error) {
    await interaction.edit({
      embeds: [errorEmbed('Balance lookup failed', (error as Error).message)],
    });
  }
}
