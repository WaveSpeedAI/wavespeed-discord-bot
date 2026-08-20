// The abstraction the command handlers are written against.
//
// Handlers never touch discord.js directly: they receive this structural
// interface, which `src/lib/discord-adapter.ts` implements on top of a real
// ChatInputCommandInteraction. That keeps every handler unit-testable with a
// plain object and no gateway connection.

import type { JobTarget } from './job.js';
import type { MessagePayload } from './render.js';

export interface CommandInteraction extends JobTarget {
  commandName: string;
  guildId: string | null;
  getString(name: string): string | null;
  getInteger(name: string): number | null;
  /** Immediate ephemeral reply, used for rejections that happen inside 3s. */
  replyEphemeral(payload: MessagePayload): Promise<void>;
}
