// Environment configuration for the bot.
//
// Everything is read once at startup so a misconfigured deployment fails
// loudly before the gateway connection is opened, rather than at the moment a
// user runs their first slash command.

export const DEFAULT_IMAGE_MODEL = 'bytedance/seedream-v5.0-pro';
export const DEFAULT_VIDEO_MODEL = 'bytedance/seedance-2.5/text-to-video';

/** Client name reported to the WaveSpeed API for channel attribution. */
export const CLIENT_NAME = 'wavespeed-discord-bot';

export interface BotConfig {
  discordToken: string;
  discordClientId: string;
  /** Optional guild id — when set, commands register instantly to that guild only. */
  devGuildId?: string;
  wavespeedApiKey: string;
  wavespeedBaseUrl: string;
  defaultImageModel: string;
  defaultVideoModel: string;
  /** Generations allowed per user inside the rolling window. */
  rateLimitPerUser: number;
  /** Rolling window length in milliseconds. */
  rateLimitWindowMs: number;
  /** Maximum generations running at once across the whole bot. */
  maxConcurrentJobs: number;
  /** When non-empty, only these Discord user ids may run generation commands. */
  allowedUserIds: string[];
  /** When non-empty, generation commands only work inside these guilds. */
  allowedGuildIds: string[];
  /** Hard ceiling on a single generation, in milliseconds. */
  jobTimeoutMs: number;
}

function req(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example for the full list.`,
    );
  }
  return value;
}

function num(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number, got "${raw}".`);
  }
  return parsed;
}

/** Parse a comma/space separated id list into a deduplicated array. */
export function parseIdList(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  return {
    discordToken: req(env, 'DISCORD_TOKEN'),
    discordClientId: req(env, 'DISCORD_CLIENT_ID'),
    devGuildId: env.DISCORD_GUILD_ID || undefined,
    wavespeedApiKey: req(env, 'WAVESPEED_API_KEY'),
    wavespeedBaseUrl: env.WAVESPEED_BASE_URL || 'https://api.wavespeed.ai',
    defaultImageModel: env.WAVESPEED_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    defaultVideoModel: env.WAVESPEED_VIDEO_MODEL || DEFAULT_VIDEO_MODEL,
    rateLimitPerUser: num(env, 'RATE_LIMIT_PER_USER', 5),
    rateLimitWindowMs: num(env, 'RATE_LIMIT_WINDOW_SECONDS', 300) * 1000,
    maxConcurrentJobs: num(env, 'MAX_CONCURRENT_JOBS', 4),
    allowedUserIds: parseIdList(env.ALLOWED_USER_IDS),
    allowedGuildIds: parseIdList(env.ALLOWED_GUILD_IDS),
    jobTimeoutMs: num(env, 'JOB_TIMEOUT_SECONDS', 1800) * 1000,
  };
}
