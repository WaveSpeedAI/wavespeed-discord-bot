// Adapter from discord.js to the structural CommandInteraction the handlers use.

import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
} from 'discord.js';
import type { CommandInteraction } from './interaction.js';
import type { MessagePayload } from './render.js';

export function adaptInteraction(
  interaction: ChatInputCommandInteraction,
): CommandInteraction {
  return {
    commandName: interaction.commandName,
    guildId: interaction.guildId,
    userId: interaction.user.id,
    userMention: `<@${interaction.user.id}>`,
    createdAt: interaction.createdTimestamp,

    getString: (name) => interaction.options.getString(name),
    getInteger: (name) => interaction.options.getInteger(name),

    async defer(options?: { ephemeral?: boolean }) {
      await interaction.deferReply(
        options?.ephemeral ? { flags: MessageFlags.Ephemeral } : undefined,
      );
    },

    async edit(payload: MessagePayload) {
      await interaction.editReply(payload as never);
    },

    async replyEphemeral(payload: MessagePayload) {
      const options = { ...payload, flags: MessageFlags.Ephemeral } as InteractionReplyOptions;
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(options);
      } else {
        await interaction.reply(options);
      }
    },

    async sendChannelMessage(payload: MessagePayload) {
      const channel = interaction.channel;
      if (!channel || !channel.isSendable()) return false;
      try {
        await channel.send(payload as never);
        return true;
      } catch {
        return false;
      }
    },
  };
}
