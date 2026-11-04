import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in to search players.' }, { status: 401 });
  const url = new URL(request.url);
  const queryText = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const gameId = Number(url.searchParams.get('gameId') || 1);
  try {
    const activeSeason = await pool.query('SELECT id FROM seasons WHERE is_active = TRUE AND starts_on <= CURRENT_DATE AND ends_on >= CURRENT_DATE LIMIT 1');
    if (!activeSeason.rows[0]) return NextResponse.json({ players: [] });
    const result = await pool.query(
      `SELECT l.user_id, l.username, l.display_name, l.region, l.game_name, l.rating,
              l.peak_rating, l.games_played, l.wins, l.losses, l.win_rate_pct, l.rank_position
       FROM leaderboard_view l JOIN player_profiles p ON p.user_id = l.user_id
       WHERE l.game_id = $1 AND l.season_id = $2
         AND ($3 = '' OR p.display_name ILIKE '%' || $3 || '%'
              OR l.username ILIKE '%' || $3 || '%'
              OR to_tsvector('english', p.display_name || ' ' || COALESCE(p.bio, '')) @@ plainto_tsquery('english', $3))
       ORDER BY l.rank_position ASC LIMIT 50`,
      [gameId, activeSeason.rows[0].id, queryText]
    );
    return NextResponse.json({ players: result.rows });
  } catch (error) {
    console.error('Player search failed:', error);
    return NextResponse.json({ error: 'Player search is unavailable.' }, { status: 500 });
  }
}
