import { describe, it, expect } from 'vitest';
import { checkAccess } from './access.js';

const ctx = { userId: 'u1', guildId: 'g1' };

describe('checkAccess', () => {
  it('is open when both allowlists are empty', () => {
    expect(checkAccess(ctx, [], []).allowed).toBe(true);
  });

  it('blocks users outside a non-empty user allowlist', () => {
    const decision = checkAccess(ctx, ['other'], []);
    expect(decision.allowed).toBe(false);
    expect(decision.message).toMatch(/allowlist/i);
  });

  it('allows users inside the user allowlist', () => {
    expect(checkAccess(ctx, ['u1', 'u2'], []).allowed).toBe(true);
  });

  it('blocks other guilds when a guild allowlist is set', () => {
    expect(checkAccess(ctx, [], ['g2']).allowed).toBe(false);
    expect(checkAccess(ctx, [], ['g1']).allowed).toBe(true);
  });

  it('blocks DMs when a guild allowlist is set', () => {
    const decision = checkAccess({ userId: 'u1', guildId: null }, [], ['g1']);
    expect(decision.allowed).toBe(false);
    expect(decision.message).toMatch(/DMs/);
  });
});
