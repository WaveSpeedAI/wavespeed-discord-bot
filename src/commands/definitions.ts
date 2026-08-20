// Slash-command definitions.
//
// This bot is slash-command-only on purpose: commands arrive over the gateway
// as interactions, so no privileged intents (MESSAGE_CONTENT, GUILD_MEMBERS,
// PRESENCE) are needed and no Discord application review is required until the
// bot reaches 100 servers.

import { SlashCommandBuilder } from 'discord.js';
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from '../config.js';

const ASPECT_RATIO_CHOICES = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'].map((value) => ({
  name: value,
  value,
}));

export const imagineCommand = new SlashCommandBuilder()
  .setName('imagine')
  .setDescription(`Generate an image with WaveSpeed (default: ${DEFAULT_IMAGE_MODEL})`)
  .addStringOption((option) =>
    option.setName('prompt').setDescription('What to generate').setRequired(true).setMaxLength(2000),
  )
  .addStringOption((option) =>
    option.setName('model').setDescription('Model id — see /models').setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName('aspect_ratio')
      .setDescription('Output aspect ratio')
      .setRequired(false)
      .addChoices(...ASPECT_RATIO_CHOICES),
  )
  .addIntegerOption((option) =>
    option.setName('count').setDescription('How many images (1-4)').setMinValue(1).setMaxValue(4),
  )
  .addIntegerOption((option) =>
    option.setName('seed').setDescription('Seed for reproducible output').setMinValue(0),
  );

export const animateCommand = new SlashCommandBuilder()
  .setName('animate')
  .setDescription(`Generate a video with WaveSpeed (default: ${DEFAULT_VIDEO_MODEL})`)
  .addStringOption((option) =>
    option.setName('prompt').setDescription('What to animate').setRequired(true).setMaxLength(2000),
  )
  .addStringOption((option) =>
    option.setName('model').setDescription('Model id — see /models').setRequired(false),
  )
  .addStringOption((option) =>
    option.setName('image').setDescription('Optional source image URL for image-to-video models'),
  )
  .addIntegerOption((option) =>
    option.setName('duration').setDescription('Clip length in seconds').setMinValue(1).setMaxValue(30),
  )
  .addStringOption((option) =>
    option
      .setName('resolution')
      .setDescription('Output resolution')
      .addChoices(
        { name: '480p', value: '480p' },
        { name: '720p', value: '720p' },
        { name: '1080p', value: '1080p' },
      ),
  )
  .addIntegerOption((option) =>
    option.setName('seed').setDescription('Seed for reproducible output').setMinValue(0),
  );

export const runCommand = new SlashCommandBuilder()
  .setName('run')
  .setDescription('Run any WaveSpeed model with raw JSON inputs')
  .addStringOption((option) =>
    option
      .setName('model')
      .setDescription('Model id, e.g. wavespeed-ai/z-image/turbo')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('inputs')
      .setDescription('JSON object of model inputs, e.g. {"prompt": "a red fox"}')
      .setRequired(true)
      .setMaxLength(4000),
  );

export const modelsCommand = new SlashCommandBuilder()
  .setName('models')
  .setDescription('Search the WaveSpeed model catalog')
  .addStringOption((option) =>
    option.setName('query').setDescription('Search text, e.g. "seedream" or "video"'),
  )
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('Filter by output type')
      .addChoices(
        { name: 'image', value: 'image' },
        { name: 'video', value: 'video' },
        { name: 'audio', value: 'audio' },
      ),
  );

export const balanceCommand = new SlashCommandBuilder()
  .setName('balance')
  .setDescription("Show the remaining credit on this bot's WaveSpeed account");

export const commandDefinitions = [
  imagineCommand,
  animateCommand,
  runCommand,
  modelsCommand,
  balanceCommand,
];

export const commandsJson = commandDefinitions.map((command) => command.toJSON());
