import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, type SessionUser } from '@/lib/auth';
import { safeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });

    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.password_hash, u.role, u.is_active,
              COALESCE(p.display_name, u.username) AS display_name
       FROM app_users u LEFT JOIN player_profiles p ON p.user_id = u.id
       WHERE lower(u.email) = $1 LIMIT 1`,
      [email]
    );
    const account = result.rows[0];
    if (!account || !account.is_active || !(await bcrypt.compare(password, account.password_hash))) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }
    const user: SessionUser = { id: account.id, username: account.username, role: account.role, displayName: account.display_name };
    const token = await createSessionToken(user);
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    await safeAudit({ actorId: user.id, actorUsername: user.username, action: 'auth.login', entityType: 'user', entityId: user.id });
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json({ error: 'Login is temporarily unavailable. Check the database configuration.' }, { status: 500 });
  }
}
