import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { pool } from '@/lib/db';

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ user: null }, { status: 200 });
  try {
    const result = await pool.query('SELECT is_active FROM app_users WHERE id = $1', [session.id]);
    if (!result.rows[0]?.is_active) return NextResponse.json({ user: null }, { status: 200 });
    return NextResponse.json({ user: session });
  } catch (error) {
    console.error('Session lookup failed:', error);
    return NextResponse.json({ error: 'Unable to verify session.' }, { status: 500 });
  }
}
