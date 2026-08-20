// Registers the slash commands with Discord.
//
// Run once after changing any command definition:
//   npm run deploy-commands
//
// With DISCORD_GUILD_ID set the commands register to that single guild and
// appear immediately — the fast loop while developing. Without it they
// register globally, which Discord may take up to an hour to propagate.

import { REST, Routes } from 'discord.js';
import { loadConfig } from './config.js';
import { commandsJson } from './commands/definitions.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  const route = config.devGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.devGuildId)
    : Routes.applicationCommands(config.discordClientId);

  const scope = config.devGuildId ? `guild ${config.devGuildId}` : 'globally';
  console.log(`Registering ${commandsJson.length} commands ${scope}…`);
  await rest.put(route, { body: commandsJson });
  console.log('Done. Commands:', commandsJson.map((c) => `/${c.name}`).join(' '));
}

main().catch((error) => {
  console.error('Failed to register commands:', error instanceof Error ? error.message : error);
  process.exit(1);
});
