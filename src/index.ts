// Bot entry point.
//
// Slash-command-only: the gateway connection asks for zero intents, which is
// what keeps this bot free of Discord's privileged-intent review.

import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config.js';
import { handlers } from './commands/index.js';
import { adaptInteraction } from './lib/discord-adapter.js';
import { RateLimiter } from './lib/rate-limit.js';
import { createGateway } from './lib/wavespeed.js';
import { errorEmbed } from './lib/render.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const gateway = createGateway(config);
  const limiter = new RateLimiter(
    config.rateLimitPerUser,
    config.rateLimitWindowMs,
    config.maxConcurrentJobs,
  );

  const pruneTimer = setInterval(() => limiter.prune(), 60_000);
  pruneTimer.unref();

  // Guilds is the only intent required, and it is NOT privileged: interactions
  // are delivered over the gateway regardless of message intents. That is what
  // keeps this bot clear of Discord's privileged-intent review. Guilds is kept
  // so `interaction.channel` resolves for the out-of-band follow-up path.
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (ready) => {
    console.log(`[bot] logged in as ${ready.user.tag}`);
    console.log(`[bot] image model: ${config.defaultImageModel}`);
    console.log(`[bot] video model: ${config.defaultVideoModel}`);
    if (config.allowedUserIds.length || config.allowedGuildIds.length) {
      console.log(
        `[bot] allowlists active — users: ${config.allowedUserIds.length || 'any'}, ` +
          `guilds: ${config.allowedGuildIds.length || 'any'}`,
      );
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const handler = handlers[interaction.commandName];
    if (!handler) return;

    const adapted = adaptInteraction(interaction);
    try {
      await handler(adapted, { config, gateway, limiter });
    } catch (error) {
      console.error(`[bot] /${interaction.commandName} failed:`, error);
      const payload = {
        embeds: [
          errorEmbed(
            'Something went wrong',
            (error as Error).message || 'The command could not be completed.',
          ),
        ],
      };
      try {
        if (interaction.deferred || interaction.replied) {
          await adapted.edit(payload);
        } else {
          await adapted.replyEphemeral(payload);
        }
      } catch {
        /* interaction token is gone; nothing left to say */
      }
    }
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[bot] ${signal} received, shutting down`);
    clearInterval(pruneTimer);
    await client.destroy();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await client.login(config.discordToken);
}

main().catch((error) => {
  console.error('[bot] fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
