import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { pool } from '@/lib/db';
import { readRecentAuditEvents } from '@/lib/mongo';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const url = new URL(request.url);
  const requestedGameId = Number(url.searchParams.get('gameId') || 1);
  try {
    const gamesResult = await pool.query('SELECT id, slug, name, genre FROM games WHERE is_active = TRUE ORDER BY id');
    const games = gamesResult.rows;
    const gameId = games.some((game) => Number(game.id) === requestedGameId) ? requestedGameId : Number(games[0]?.id || 1);
    const activeSeasonResult = await pool.query(
      `SELECT id, name FROM seasons WHERE is_active = TRUE AND starts_on <= CURRENT_DATE AND ends_on >= CURRENT_DATE
       ORDER BY starts_on DESC LIMIT 1`
    );
    const activeSeason = activeSeasonResult.rows[0] || null;

    const [statsResult, leaderboardResult, matchesResult, queueResult, queueCountResult, pendingResult] = await Promise.all([
      activeSeason
        ? pool.query(
            `SELECT rating, peak_rating, games_played, wins, losses,
                    ROUND(100.0 * wins / NULLIF(games_played, 0), 1) AS win_rate_pct
             FROM player_game_stats WHERE player_id = $1 AND game_id = $2 AND season_id = $3`,
            [user.id, gameId, activeSeason.id]
          )
        : Promise.resolve({ rows: [] }),
      activeSeason
        ? pool.query(
            `SELECT user_id, username, display_name, region, game_id, game_name, season_id, season_name,
                    rating, peak_rating, games_played, wins, losses, win_rate_pct, rank_position
             FROM leaderboard_view WHERE game_id = $1 AND season_id = $2
             ORDER BY rank_position ASC LIMIT 25`,
            [gameId, activeSeason.id]
          )
        : Promise.resolve({ rows: [] }),
      pool.query(
        `SELECT m.id, m.game_id, g.name AS game_name, m.season_id, se.name AS season_name,
                m.player_a_id, ua.username AS player_a_username, pa.display_name AS player_a_name,
                m.player_b_id, ub.username AS player_b_username, pb.display_name AS player_b_name,
                m.winner_id, uw.username AS winner_username, pw.display_name AS winner_name,
                m.status, m.player_a_rating_before, m.player_b_rating_before,
                m.player_a_rating_after, m.player_b_rating_after, m.created_at, m.completed_at
         FROM matches m
         JOIN games g ON g.id = m.game_id
         JOIN seasons se ON se.id = m.season_id
         JOIN app_users ua ON ua.id = m.player_a_id
         JOIN player_profiles pa ON pa.user_id = m.player_a_id
         JOIN app_users ub ON ub.id = m.player_b_id
         JOIN player_profiles pb ON pb.user_id = m.player_b_id
         LEFT JOIN app_users uw ON uw.id = m.winner_id
         LEFT JOIN player_profiles pw ON pw.user_id = m.winner_id
         WHERE m.player_a_id = $1 OR m.player_b_id = $1 OR $2 = 'ADMIN'
         ORDER BY m.created_at DESC LIMIT 30`,
        [user.id, user.role]
      ),
      pool.query(
        `SELECT q.id, q.game_id, g.name AS game_name, q.season_id, s.name AS season_name,
                q.rating_snapshot, q.joined_at
         FROM matchmaking_queue q JOIN games g ON g.id = q.game_id JOIN seasons s ON s.id = q.season_id
         WHERE q.player_id = $1 LIMIT 1`,
        [user.id]
      ),
      activeSeason
        ? pool.query('SELECT COUNT(*)::INTEGER AS queue_count FROM matchmaking_queue WHERE game_id = $1 AND season_id = $2', [gameId, activeSeason.id])
        : Promise.resolve({ rows: [{ queue_count: 0 }] }),
      user.role === 'ADMIN'
        ? pool.query(
            `SELECT m.id, m.game_id, g.name AS game_name, m.season_id, se.name AS season_name,
                    m.player_a_id, ua.username AS player_a_username, pa.display_name AS player_a_name,
                    m.player_b_id, ub.username AS player_b_username, pb.display_name AS player_b_name,
                    m.status, m.created_at
             FROM matches m JOIN games g ON g.id = m.game_id JOIN seasons se ON se.id = m.season_id
             JOIN app_users ua ON ua.id = m.player_a_id JOIN player_profiles pa ON pa.user_id = m.player_a_id
             JOIN app_users ub ON ub.id = m.player_b_id JOIN player_profiles pb ON pb.user_id = m.player_b_id
             WHERE m.status = 'PENDING' ORDER BY m.created_at ASC LIMIT 30`
          )
        : Promise.resolve({ rows: [] })
    ]);

    let recentAuditEvents: unknown[] = [];
    if (user.role === 'ADMIN') {
      try { recentAuditEvents = await readRecentAuditEvents(8); }
      catch (error) { console.error('Could not load MongoDB audit events:', error); }
    }

    return NextResponse.json({
      user,
      games,
      activeSeason,
      selectedGameId: gameId,
      stats: statsResult.rows[0] || null,
      leaderboard: leaderboardResult.rows,
      matches: matchesResult.rows,
      queue: queueResult.rows[0] || null,
      queueCount: queueCountResult.rows[0]?.queue_count ?? 0,
      pendingMatches: pendingResult.rows,
      recentAuditEvents
    });
  } catch (error) {
    console.error('Dashboard query failed:', error);
    return NextResponse.json({ error: 'Could not load platform data. Confirm PostgreSQL schema and seed data are available.' }, { status: 500 });
  }
}
