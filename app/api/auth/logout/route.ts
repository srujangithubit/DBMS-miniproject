import { NextResponse } from 'next/server';
import { getSessionUser, SESSION_COOKIE } from '@/lib/auth';
import { safeAudit } from '@/lib/audit';

export async function POST() {
  const user = await getSessionUser();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  if (user) await safeAudit({ actorId: user.id, actorUsername: user.username, action: 'auth.logout', entityType: 'user', entityId: user.id });
  return response;
}
