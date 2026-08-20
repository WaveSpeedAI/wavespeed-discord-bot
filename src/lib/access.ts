// Optional allowlists.
//
// Both lists are empty by default (open to everyone who can see the bot).
// A self-hoster who does not want their credits drained sets either or both.

export interface AccessContext {
  userId: string;
  guildId: string | null;
}

export interface AccessDecision {
  allowed: boolean;
  message?: string;
}

export function checkAccess(
  ctx: AccessContext,
  allowedUserIds: string[],
  allowedGuildIds: string[],
): AccessDecision {
  if (allowedUserIds.length > 0 && !allowedUserIds.includes(ctx.userId)) {
    return {
      allowed: false,
      message:
        'This bot is restricted to an allowlist of users. Ask the bot owner to add your Discord user id.',
    };
  }
  if (allowedGuildIds.length > 0) {
    if (!ctx.guildId) {
      return {
        allowed: false,
        message: 'This bot only responds inside its allowlisted servers, not in DMs.',
      };
    }
    if (!allowedGuildIds.includes(ctx.guildId)) {
      return {
        allowed: false,
        message: 'This bot is not enabled for this server. Ask the bot owner to allowlist it.',
      };
    }
  }
  return { allowed: true };
}
