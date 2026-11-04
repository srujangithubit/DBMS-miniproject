import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { inTransaction } from '@/lib/db';
import { safeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

type RouteContext = { params: { id: string } };

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only an administrator can finalize official match results.' }, { status: 403 });

  const matchId = context.params.id;
  try {
    const body = await request.json();
    const winnerId = typeof body.winnerId === 'string' ? body.winnerId : '';
    if (!winnerId) return NextResponse.json({ error: 'Select a valid match winner.' }, { status: 400 });
    const result = await inTransaction(async (client) => {
      const finalized = await client.query('SELECT * FROM finalize_match($1::uuid, $2::uuid)', [matchId, winnerId]);
      const match = await client.query(
        `SELECT id, game_id, season_id, player_a_id, player_b_id, winner_id, status,
                player_a_rating_before, player_b_rating_before, player_a_rating_after, player_b_rating_after,
                completed_at FROM matches WHERE id = $1`,
        [matchId]
      );
      return { calculation: finalized.rows[0], match: match.rows[0] };
    });
    await safeAudit({
      actorId: user.id, actorUsername: user.username, action: 'match.result_finalized',
      entityType: 'match', entityId: matchId,
      details: { winnerId, playerANewRating: result.calculation.player_a_new_rating, playerBNewRating: result.calculation.player_b_new_rating }
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Match finalization failed:', error);
    const clientError = /does not exist|Only PENDING|Winner must|Rating record|participant/i.test(message);
    return NextResponse.json({ error: clientError ? message : 'Could not finalize this match. Check server logs.' }, { status: clientError ? 400 : 500 });
  }
}
