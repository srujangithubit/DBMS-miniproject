import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { inTransaction } from '@/lib/db';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, type SessionUser } from '@/lib/auth';
import { safeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let user: SessionUser | null = null;
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
      return NextResponse.json({ error: 'Username must be 3-24 characters and contain only letters, numbers, or underscores.' }, { status: 400 });
    }
    if (displayName.length < 2 || displayName.length > 32) {
      return NextResponse.json({ error: 'Display name must be 2-32 characters.' }, { status: 400 });
    }
    if (password.length < 8 || password.length > 72) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    user = await inTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO app_users (username, email, password_hash, role)
         VALUES ($1, $2, $3, 'PLAYER') RETURNING id, username, role`,
        [username, email, passwordHash]
      );
      const row = inserted.rows[0];
      await client.query(
        `INSERT INTO player_profiles (user_id, display_name) VALUES ($1, $2)`,
        [row.id, displayName]
      );
      await client.query(
        `INSERT INTO player_game_stats (player_id, game_id, season_id)
         SELECT $1, g.id, s.id FROM games g CROSS JOIN seasons s
         WHERE g.is_active = TRUE AND s.is_active = TRUE
         ON CONFLICT (player_id, game_id, season_id) DO NOTHING`,
        [row.id]
      );
      return { id: row.id, username: row.username, role: row.role, displayName } as SessionUser;
    });

    const token = await createSessionToken(user);
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    await safeAudit({ actorId: user.id, actorUsername: user.username, action: 'auth.register', entityType: 'user', entityId: user.id });
    return response;
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === '23505') return NextResponse.json({ error: 'That email or username is already registered.' }, { status: 409 });
    console.error('Registration failed:', error);
    return NextResponse.json({ error: 'Registration failed. Confirm that the database is running and a season is configured.' }, { status: 500 });
  }
}
