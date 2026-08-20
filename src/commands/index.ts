// Command routing table. Handlers are keyed by slash-command name.

import type { CommandInteraction } from '../lib/interaction.js';
import type { CommandContext } from './context.js';
import { execute as imagine } from './imagine.js';
import { execute as animate } from './animate.js';
import { execute as run } from './run.js';
import { execute as models } from './models.js';
import { execute as balance } from './balance.js';

export type CommandHandler = (
  interaction: CommandInteraction,
  ctx: CommandContext,
) => Promise<void>;

export const handlers: Record<string, CommandHandler> = {
  imagine,
  animate,
  run,
  models,
  balance,
};

export type { CommandContext } from './context.js';
