// Shared test doubles. Excluded from the production build.

import { vi } from 'vitest';
import type { BotConfig } from './config.js';
import type { CommandInteraction } from './lib/interaction.js';
import type { MessagePayload } from './lib/render.js';
import type { CatalogModel, GenerationOutcome, WaveSpeedGateway } from './lib/wavespeed.js';

export function fakeConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    discordToken: 'token',
    discordClientId: 'client',
    wavespeedApiKey: 'key',
    wavespeedBaseUrl: 'https://api.example.invalid',
    defaultImageModel: 'bytedance/seedream-v5.0-pro',
    defaultVideoModel: 'bytedance/seedance-2.5/text-to-video',
    rateLimitPerUser: 5,
    rateLimitWindowMs: 300_000,
    maxConcurrentJobs: 4,
    allowedUserIds: [],
    allowedGuildIds: [],
    jobTimeoutMs: 1_800_000,
    ...overrides,
  };
}

export interface FakeInteraction extends CommandInteraction {
  calls: {
    defer: Array<{ ephemeral?: boolean } | undefined>;
    edit: MessagePayload[];
    channel: MessagePayload[];
    ephemeral: MessagePayload[];
  };
}

export function fakeInteraction(
  options: {
    commandName?: string;
    strings?: Record<string, string>;
    integers?: Record<string, number>;
    userId?: string;
    guildId?: string | null;
    createdAt?: number;
    channelSendable?: boolean;
  } = {},
): FakeInteraction {
  const calls: FakeInteraction['calls'] = { defer: [], edit: [], channel: [], ephemeral: [] };
  const strings = options.strings ?? {};
  const integers = options.integers ?? {};

  return {
    calls,
    commandName: options.commandName ?? 'imagine',
    userId: options.userId ?? 'user-1',
    userMention: `<@${options.userId ?? 'user-1'}>`,
    guildId: options.guildId === undefined ? 'guild-1' : options.guildId,
    createdAt: options.createdAt ?? Date.now(),
    getString: (name: string) => (name in strings ? strings[name]! : null),
    getInteger: (name: string) => (name in integers ? integers[name]! : null),
    async defer(opts) {
      calls.defer.push(opts);
    },
    async edit(payload) {
      calls.edit.push(payload);
    },
    async replyEphemeral(payload) {
      calls.ephemeral.push(payload);
    },
    async sendChannelMessage(payload) {
      if (options.channelSendable === false) return false;
      calls.channel.push(payload);
      return true;
    },
  };
}

export function fakeOutcome(overrides: Partial<GenerationOutcome> = {}): GenerationOutcome {
  return {
    predictionId: 'pred-abc123',
    status: 'completed',
    outputs: ['https://cdn.example.invalid/out.png'],
    model: 'bytedance/seedream-v5.0-pro',
    ...overrides,
  };
}

export function fakeGateway(
  options: {
    outcome?: GenerationOutcome;
    generate?: WaveSpeedGateway['generate'];
    models?: CatalogModel[];
    balance?: { balance: number; currency: string };
  } = {},
): WaveSpeedGateway {
  return {
    generate: options.generate ?? vi.fn(async () => options.outcome ?? fakeOutcome()),
    listModels: vi.fn(async () => options.models ?? []),
    getBalance: vi.fn(async () => options.balance ?? { balance: 12.5, currency: 'USD' }),
  };
}
