import { describe, it, expect } from 'vitest';
import { getAuthSession } from './authTypes';
import type { Session } from 'next-auth';

function makeSession(overrides?: Partial<Session['user'] & { id?: string }>): Session {
  return {
    expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    user: {
      id: 'usr_1',
      name: 'Alice',
      email: 'alice@example.com',
      image: null,
      ...overrides,
    } as Session['user'] & { id: string },
  } as Session;
}

describe('getAuthSession', () => {
  it('returns null when session is null', () => {
    expect(getAuthSession(null)).toBeNull();
  });

  it('returns null when session has no user', () => {
    const s = { expires: '2099-01-01', user: undefined } as unknown as Session;
    expect(getAuthSession(s)).toBeNull();
  });

  it('returns null when user has no id', () => {
    const s = makeSession({ id: undefined });
    expect(getAuthSession(s)).toBeNull();
  });

  it('returns typed AuthSession when user has an id', () => {
    const s = makeSession();
    const result = getAuthSession(s);
    expect(result).not.toBeNull();
    expect(result!.user.id).toBe('usr_1');
    expect(result!.user.name).toBe('Alice');
    expect(result!.user.email).toBe('alice@example.com');
  });

  it('returns same session reference cast to AuthSession', () => {
    const s = makeSession();
    const result = getAuthSession(s);
    expect(result).toBe(s);
  });
});
