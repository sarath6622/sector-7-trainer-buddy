import { describe, it, expect } from 'vitest';
import { authConfig } from '../auth.config';
import type { JWT } from 'next-auth/jwt';

// Pull the callbacks out of the config so we can test them in isolation
const { jwt, session, authorized } = authConfig.callbacks!;

// ── JWT callback ─────────────────────────────────────────────────────────────

describe('jwt() callback', () => {
  const baseToken: JWT = { sub: 'existing', iat: 0, exp: 0, jti: 'x' };

  it('persists user id and role into token on first sign-in', () => {
    const result = jwt!({
      token: baseToken,
      user: { id: 'user-1', role: 'TRAINER', email: 't@test.com' } as any,
      // remaining required params — not used by our callback
      account: null,
      trigger: 'signIn',
      isNewUser: false,
      session: undefined,
    });
    expect(result.id).toBe('user-1');
    expect(result.role).toBe('TRAINER');
  });

  it('leaves token unchanged when no user is present (subsequent requests)', () => {
    const tokenWithData = { ...baseToken, id: 'user-1', role: 'CLIENT' };
    const result = jwt!({
      token: tokenWithData,
      user: undefined as any,
      account: null,
      trigger: 'update',
      isNewUser: false,
      session: undefined,
    });
    expect(result.id).toBe('user-1');
    expect(result.role).toBe('CLIENT');
  });
});

// ── Session callback ──────────────────────────────────────────────────────────

describe('session() callback', () => {
  it('copies id and role from token onto session.user', () => {
    // Cast to any to avoid the AdapterUser type mismatch from next-auth beta generics
    const mockSession = {
      user: { name: 'Test', email: 't@test.com', image: null },
      expires: '2099-01-01',
    } as any;
    const mockToken: JWT = { id: 'user-2', role: 'ADMIN', sub: 'user-2', iat: 0, exp: 0, jti: 'y' };

    const result = session!({ session: mockSession, token: mockToken, user: undefined as any, newSession: undefined, trigger: 'update' });
    expect(result.user.id).toBe('user-2');
    expect((result.user as any).role).toBe('ADMIN');
  });
});

// ── Authorized callback ───────────────────────────────────────────────────────

describe('authorized() callback', () => {
  // Helper to create a mock request with a given URL path
  const mockRequest = (path: string) => ({
    nextUrl: new URL(`http://localhost:3000${path}`),
  });

  // Helper to create a mock auth session with a role
  const mockAuth = (role: string) => ({
    user: { id: 'u1', role, email: 'x@x.com' },
    expires: '2099-01-01',
  });

  it('allows unauthenticated access to login page', () => {
    const result = authorized!({ auth: null, request: mockRequest('/login') as any });
    expect(result).toBe(true);
  });

  it('allows unauthenticated access to register page', () => {
    const result = authorized!({ auth: null, request: mockRequest('/register') as any });
    expect(result).toBe(true);
  });

  it('blocks unauthenticated access to dashboard routes', () => {
    const result = authorized!({ auth: null, request: mockRequest('/admin') as any });
    expect(result).toBe(false);
  });

  it('allows ADMIN to access /admin', () => {
    const result = authorized!({
      auth: mockAuth('ADMIN') as any,
      request: mockRequest('/admin/users') as any,
    });
    expect(result).toBe(true);
  });

  it('redirects TRAINER away from /admin to /trainer', () => {
    const result = authorized!({
      auth: mockAuth('TRAINER') as any,
      request: mockRequest('/admin/dashboard') as any,
    });
    // A redirect Response is returned when role doesn't match route
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get('location')).toContain('/trainer');
  });

  it('redirects CLIENT away from /trainer to /client', () => {
    const result = authorized!({
      auth: mockAuth('CLIENT') as any,
      request: mockRequest('/trainer/clients') as any,
    });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get('location')).toContain('/client');
  });

  it('redirects already-logged-in user away from /login to their dashboard', () => {
    const result = authorized!({
      auth: mockAuth('TRAINER') as any,
      request: mockRequest('/login') as any,
    });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get('location')).toContain('/trainer');
  });
});
