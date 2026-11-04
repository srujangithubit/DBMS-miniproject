import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { pool } from '@/lib/db';
import { safeAudit } from '@/lib/audit';

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (user.role !== 'PLAYER') return NextResponse.json({ error: 'Only player accounts have queue entries.' }, { status: 403 });
  try {
    const result = await pool.query('DELETE FROM matchmaking_queue WHERE player_id = $1 RETURNING id, game_id', [user.id]);
    if (result.rowCount) {
      await safeAudit({ actorId: user.id, actorUsername: user.username, action: 'matchmaking.queue_left', entityType: 'queue', entityId: result.rows[0].id, details: { gameId: result.rows[0].game_id } });
    }
    return NextResponse.json({ ok: true, removed: Boolean(result.rowCount), message: result.rowCount ? 'You left the matchmaking queue.' : 'You were not in a queue.' });
  } catch (error) {
    console.error('Queue leave failed:', error);
    return NextResponse.json({ error: 'Unable to leave the queue.' }, { status: 500 });
  }
}
