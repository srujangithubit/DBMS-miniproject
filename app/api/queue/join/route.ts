import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { inTransaction } from '@/lib/db';
import { safeAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const MAX_RATING_GAP = 300;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in to join matchmaking.' }, { status: 401 });
  if (user.role !== 'PLAYER') return NextResponse.json({ error: 'Only player accounts can join the queue.' }, { status: 403 });

  try {
    const body = await request.json();
    const gameId = Number(body.gameId);
    if (!Number.isInteger(gameId) || gameId < 1) return NextResponse.json({ error: 'Choose a valid game.' }, { status: 400 });

    const outcome = await inTransaction(async (client) => {
      const game = await client.query('SELECT id, slug, name FROM games WHERE id = $1 AND is_active = TRUE', [gameId]);
      if (!game.rows[0]) throw Object.assign(new Error('That game is not available.'), { httpStatus: 404 });
      const seasonResult = await client.query(
        `SELECT id, name FROM seasons WHERE is_active = TRUE AND starts_on <= CURRENT_DATE AND ends_on >= CURRENT_DATE
         ORDER BY starts_on DESC LIMIT 1`
      );
      const season = seasonResult.rows[0];
      if (!season) throw Object.assign(new Error('There is no active season. Ask an administrator to configure one.'), { httpStatus: 409 });

      const existing = await client.query('SELECT game_id, season_id FROM matchmaking_queue WHERE player_id = $1 FOR UPDATE', [user.id]);
      if (existing.rows[0]) {
        if (Number(existing.rows[0].game_id) !== gameId || existing.rows[0].season_id !== season.id) {
          throw Object.assign(new Error('You are already queued for a different game or season. Leave that queue first.'), { httpStatus: 409 });
        }
        return { status: 'ALREADY_QUEUED', game: game.rows[0], season, match: null };
      }

      await client.query(
        `INSERT INTO player_game_stats (player_id, game_id, season_id)
         VALUES ($1, $2, $3) ON CONFLICT (player_id, game_id, season_id) DO NOTHING`,
        [user.id, gameId, season.id]
      );
      const stats = await client.query(
        'SELECT rating FROM player_game_stats WHERE player_id = $1 AND game_id = $2 AND season_id = $3',
        [user.id, gameId, season.id]
      );
      const rating = Number(stats.rows[0].rating);

      const opponentResult = await client.query(
        `SELECT q.id, q.player_id, q.rating_snapshot, p.display_name
         FROM matchmaking_queue q JOIN player_profiles p ON p.user_id = q.player_id
         WHERE q.game_id = $1 AND q.season_id = $2 AND q.player_id <> $3
           AND ABS(q.rating_snapshot - $4) <= $5
         ORDER BY ABS(q.rating_snapshot - $4) ASC, q.joined_at ASC
         LIMIT 1 FOR UPDATE OF q SKIP LOCKED`,
        [gameId, season.id, user.id, rating, MAX_RATING_GAP]
      );

      if (opponentResult.rows[0]) {
        const opponent = opponentResult.rows[0];
        const matchResult = await client.query(
          `INSERT INTO matches (game_id, season_id, player_a_id, player_b_id, status)
           VALUES ($1, $2, $3, $4, 'PENDING') RETURNING id, player_a_id, player_b_id, created_at`,
          [gameId, season.id, opponent.player_id, user.id]
        );
        await client.query('DELETE FROM matchmaking_queue WHERE player_id IN ($1, $2)', [opponent.player_id, user.id]);
        return { status: 'MATCH_FOUND', game: game.rows[0], season, match: { ...matchResult.rows[0], opponentName: opponent.display_name, opponentRating: Number(opponent.rating_snapshot) } };
      }

      await client.query(
        `INSERT INTO matchmaking_queue (player_id, game_id, season_id, rating_snapshot)
         VALUES ($1, $2, $3, $4) ON CONFLICT (player_id) DO NOTHING`,
        [user.id, gameId, season.id, rating]
      );
      return { status: 'QUEUED', game: game.rows[0], season, match: null, rating };
    });

    await safeAudit({
      actorId: user.id, actorUsername: user.username,
      action: outcome.status === 'MATCH_FOUND' ? 'matchmaking.match_created' : 'matchmaking.queue_joined',
      entityType: outcome.status === 'MATCH_FOUND' ? 'match' : 'queue',
      entityId: outcome.match?.id || user.id,
      details: { gameId, gameName: outcome.game.name, season: outcome.season.name, result: outcome.status }
    });
    return NextResponse.json({ ...outcome, message: outcome.status === 'MATCH_FOUND' ? `Match found against ${outcome.match?.opponentName}.` : 'You are in the queue. We will match you with a nearby rating when a compatible player is available.' });
  } catch (error) {
    const typed = error as { httpStatus?: number; message?: string };
    const status = typed.httpStatus || 500;
    if (status === 500) console.error('Queue join failed:', error);
    return NextResponse.json({ error: status === 500 ? 'Matchmaking could not complete. Check server logs and database status.' : typed.message }, { status });
  }
}
