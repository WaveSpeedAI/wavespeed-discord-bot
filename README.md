# WaveSpeed Discord Bot

The official, self-hostable Discord bot for [WaveSpeed](https://wavespeed.ai) — generate
images and video from slash commands, in any server you run it in.

Slash-command only, TypeScript, [discord.js](https://discord.js.org) v14, built on the
official [`wavespeed`](https://www.npmjs.com/package/wavespeed) SDK.

> [!WARNING]
> **This bot is meant to be self-hosted, and whoever hosts it pays for every generation.**
> It runs on a single `WAVESPEED_API_KEY` — yours — so any user who can see the bot spends
> your credit. Keep it in servers you control, and read
> [Cost and abuse control](#cost-and-abuse-control) before inviting it anywhere public.
>
> (A shared bot *could* collect each user's own key via a `/link` modal instead; that is a
> deliberate non-goal here, not a Discord limitation. This build is single-key by design.)

---

## Commands

| Command | What it does |
| --- | --- |
| `/imagine prompt:… [model] [aspect_ratio] [count] [seed]` | Text-to-image. Default model `bytedance/seedream-v5.0-pro`. |
| `/animate prompt:… [model] [image] [duration] [resolution] [seed]` | Text-to-video (or image-to-video via `image:`). Default model `bytedance/seedance-2.5/text-to-video`. |
| `/run model:… inputs:…` | Any model id on the catalog with a raw JSON input object, e.g. `{"prompt": "a red fox"}`. |
| `/models [query] [type]` | Search the live WaveSpeed catalog by id, name or description. |
| `/balance` | Remaining credit on the host's account. Replies **ephemerally** — the balance is the host's, not the channel's. |

Every generation reply carries the **prediction id**, so a job can always be looked up
later against the WaveSpeed API even if Discord loses the message.

---

## How the two Discord timers are handled

This is the part that breaks most naive gen-AI bots, so it is worth stating explicitly.

**1. The 3-second acknowledgement window.** Discord invalidates an interaction that is not
acknowledged within 3 seconds. No image or video model returns that fast. Every generation
handler therefore calls `deferReply()` as its *first* action — before validating anything
expensive, before touching the network — which converts the command into a "thinking…"
placeholder that can be edited for the next 15 minutes. The result arrives via
`editReply()`. See `src/lib/job.ts`; `src/lib/job.test.ts` asserts the ordering
(defer strictly precedes the first API call).

**2. The 15-minute interaction token.** An interaction token dies 15 minutes after the
interaction was created; `editReply` and `followUp` then both fail with
`Unknown Webhook (10015)`. Long video jobs can outlive that. The bot watches the clock
itself:

- At **14 minutes** (15 min lifetime minus a 60 s safety margin), while the token is still
  valid, it spends the token on a final edit: *"Still generating… I'll post the result in
  this channel and mention you when it lands."*
- When the job actually settles, the result is delivered as a **new channel message** that
  mentions the requester and includes the prediction id and the output.
- If the bot cannot post to that channel (a DM, or missing `Send Messages`), the outcome —
  prediction id, status and output URL — is written to the host's logs so the job is still
  recoverable.

Both paths are covered by tests in `src/lib/job.test.ts`.

> **Note on the prediction id.** The `wavespeed` SDK surfaces the task id when a prediction
> reaches a terminal state, not at submit time, so the "still generating" edit cannot name
> the id yet. The id is always present in the terminal message — the successful edit, the
> failure embed, the out-of-band channel message, and the log line.

---

## Setup

### Requirements

- Node.js 20+ (or Docker)
- A WaveSpeed API key — <https://wavespeed.ai/accesskey>
- A Discord application you control

### 1. Create the Discord application

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → **Reset Token** → copy it into `DISCORD_TOKEN`.
3. **General Information** tab → copy **Application ID** into `DISCORD_CLIENT_ID`.
4. Leave every **Privileged Gateway Intent** OFF. This bot is slash-command-only and needs
   none of them — which is also why it needs no Discord verification or review until it
   reaches 100 servers.

### 2. Configure

```bash
cp .env.example .env
# fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, WAVESPEED_API_KEY
```

Set `DISCORD_GUILD_ID` to a test server id while you develop: guild commands appear
instantly, global ones can take up to an hour to propagate.

### 3. Register the slash commands

```bash
npm ci
npm run deploy-commands
```

Re-run this whenever a command definition changes.

### 4. Run

```bash
npm run build && npm start
# or, during development:
npm run dev
```

### Docker

```bash
cp .env.example .env      # fill it in
docker compose build
docker compose run --rm bot node dist/deploy-commands.js   # once
docker compose up -d
```

### 5. Invite the bot

Build the invite URL with your application id:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APPLICATION_ID&scope=bot%20applications.commands&permissions=52224
```

Required OAuth2 scopes:

- **`applications.commands`** — registers and serves the slash commands.
- **`bot`** — lets the bot join the server and post the out-of-band follow-up message when
  a job outlives the 15-minute interaction token.

The `permissions=52224` bitfield is **View Channel + Send Messages + Embed Links + Attach
Files**. Send Messages is genuinely required: without it the long-job fallback cannot
deliver, and the result only reaches the host's logs.

You can also generate this URL in the Developer Portal under **OAuth2 → URL Generator**.

---

## Cost and abuse control

Every `/imagine`, `/animate` and `/run` bills the account behind `WAVESPEED_API_KEY`. Four
controls ship enabled or one flag away:

| Setting | Default | Effect |
| --- | --- | --- |
| `RATE_LIMIT_PER_USER` / `RATE_LIMIT_WINDOW_SECONDS` | 5 per 300 s | Rolling per-user window. Rejections are ephemeral and cost nothing. |
| `MAX_CONCURRENT_JOBS` | 4 | Global in-flight cap, so a busy channel cannot queue unbounded spend. |
| `ALLOWED_USER_IDS` | empty (open) | Comma-separated Discord user ids. When set, only they may generate. |
| `ALLOWED_GUILD_IDS` | empty (open) | Comma-separated server ids. When set, the bot generates nowhere else. |
| `JOB_TIMEOUT_SECONDS` | 1800 | Hard ceiling on a single generation. |

Recommended for anything beyond a private server: set `ALLOWED_GUILD_IDS`, keep the
per-user window tight, and watch `/balance`.

The SDK is configured with `maxRetries: 0`, and the `wavespeed` SDK never replays a
submission POST — one slash command can never be billed twice.

---

## Development

```bash
npm run lint       # eslint
npm run typecheck  # tsc --noEmit, strict
npm test           # vitest
npm run build
```

Tests never touch the live WaveSpeed API: `src/test-helpers.ts` supplies a fake gateway and
a fake interaction, and command handlers are written against a structural
`CommandInteraction` interface (`src/lib/interaction.ts`) rather than discord.js types.
`src/lib/discord-adapter.ts` is the only file that bridges the two.

```
src/
  index.ts               gateway client + interaction router
  deploy-commands.ts     slash-command registration
  config.ts              env parsing, fails fast at startup
  commands/
    definitions.ts       SlashCommandBuilder definitions
    context.ts           access check -> rate limit -> job
    imagine|animate|run|models|balance.ts
  lib/
    job.ts               defer -> generate -> edit, with token-expiry fallback
    wavespeed.ts         SDK client + catalog/balance REST reads
    rate-limit.ts        per-user window + global concurrency
    access.ts            optional allowlists
    render.ts            embeds and attachments
    discord-adapter.ts   discord.js -> CommandInteraction
```

---

## Publishing the bot publicly

If you want this bot listed rather than just self-hosted:

- A [top.gg](https://top.gg) listing requires the bot to be **public, invitable, and online
  during review** — a private or offline bot is rejected.
- Discord requires app verification once the bot reaches **100 servers**. Because this bot
  requests no privileged intents, that is the only gate you will meet.

## License

MIT — see [LICENSE](LICENSE).

---

**[WaveSpeed AI](https://wavespeed.ai/)** — AI image & video generation platform.
Try it in the browser: **[Image generator](https://wavespeed.ai/image-generator)** · **[Video generator](https://wavespeed.ai/video-generator)**
