import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'esports_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionUser = {
  id: string;
  username: string;
  role: 'PLAYER' | 'ADMIN';
  displayName: string;
};

function signingKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role, displayName: user.displayName })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(signingKey());
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.username !== 'string' || !['PLAYER', 'ADMIN'].includes(String(payload.role))) return null;
    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role as SessionUser['role'],
      displayName: typeof payload.displayName === 'string' ? payload.displayName : payload.username
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS
  };
}
