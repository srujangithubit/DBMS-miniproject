-- Parameter note: replace :player_uuid, :entrant_rating, :game_id, :season_id and :match_uuid with real values before running.
-- Q1. Current-season leaderboard (view + ranking window function).
SELECT rank_position, display_name, username, rating, wins, losses, win_rate_pct
FROM leaderboard_view
WHERE game_id = (SELECT id FROM games WHERE slug = 'valorant')
  AND season_id = (SELECT id FROM seasons WHERE is_active = TRUE)
ORDER BY rank_position
LIMIT 10;

-- Q2. Player match history using joins.
SELECT m.id, g.name AS game, pa.display_name AS player_a, pb.display_name AS player_b,
       pw.display_name AS winner, m.status, m.created_at, m.completed_at
FROM matches m
JOIN games g ON g.id = m.game_id
JOIN player_profiles pa ON pa.user_id = m.player_a_id
JOIN player_profiles pb ON pb.user_id = m.player_b_id
LEFT JOIN player_profiles pw ON pw.user_id = m.winner_id
WHERE m.player_a_id = :player_uuid OR m.player_b_id = :player_uuid
ORDER BY m.created_at DESC;

-- Q3. Aggregate performance per game/season without multiplying player totals by match joins.
WITH player_totals AS (
  SELECT game_id, season_id, COUNT(*) AS ranked_players,
         ROUND(AVG(rating), 1) AS average_rating,
         SUM(games_played) AS player_match_appearances
  FROM player_game_stats
  GROUP BY game_id, season_id
), match_totals AS (
  SELECT game_id, season_id,
         COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_matches
  FROM matches
  GROUP BY game_id, season_id
)
SELECT g.name, s.name AS season, pt.ranked_players, pt.average_rating,
       pt.player_match_appearances, COALESCE(mt.completed_matches, 0) AS completed_matches
FROM player_totals pt
JOIN games g ON g.id = pt.game_id
JOIN seasons s ON s.id = pt.season_id
LEFT JOIN match_totals mt ON mt.game_id = pt.game_id AND mt.season_id = pt.season_id
WHERE pt.ranked_players >= 1
ORDER BY pt.average_rating DESC;

-- Q4. Find compatible queued candidates for one entrant (range filter + ordering).
SELECT q.player_id, p.display_name, q.rating_snapshot,
       ABS(q.rating_snapshot - :entrant_rating) AS rating_gap, q.joined_at
FROM matchmaking_queue q
JOIN player_profiles p ON p.user_id = q.player_id
WHERE q.game_id = :game_id AND q.season_id = :season_id
  AND ABS(q.rating_snapshot - :entrant_rating) <= 300
ORDER BY ABS(q.rating_snapshot - :entrant_rating), q.joined_at
LIMIT 10;

-- Q5. Rating movement for a player in chronological order.
SELECT rh.created_at, g.name AS game, s.name AS season,
       rh.old_rating, rh.new_rating, rh.delta, m.id AS match_id
FROM rating_history rh
JOIN games g ON g.id = rh.game_id
JOIN seasons s ON s.id = rh.season_id
JOIN matches m ON m.id = rh.match_id
WHERE rh.player_id = :player_uuid
ORDER BY rh.created_at DESC
LIMIT 25;

-- Q6. Players with at least five completed games and a win rate of at least 60%.
SELECT display_name, username, game_name, season_name, games_played, wins, losses, win_rate_pct
FROM leaderboard_view
WHERE games_played >= 5 AND win_rate_pct >= 60
ORDER BY rating DESC;

-- Q7. Full-text player search (backed by the GIN index on player_profiles).
SELECT p.user_id, p.display_name, u.username, ts_rank(
         to_tsvector('english', p.display_name || ' ' || COALESCE(p.bio, '')),
         plainto_tsquery('english', 'tactical player')
       ) AS relevance
FROM player_profiles p
JOIN app_users u ON u.id = p.user_id
WHERE to_tsvector('english', p.display_name || ' ' || COALESCE(p.bio, ''))
      @@ plainto_tsquery('english', 'tactical player')
ORDER BY relevance DESC;

-- Q8. Inspect a specific match and its two audit rows after finalization.
SELECT m.id, m.status, m.winner_id,
       m.player_a_rating_before, m.player_a_rating_after,
       m.player_b_rating_before, m.player_b_rating_after
FROM matches m WHERE m.id = :match_uuid;
SELECT player_id, old_rating, new_rating, delta, created_at
FROM rating_history WHERE match_id = :match_uuid ORDER BY player_id;

-- Q9. Demonstrate transaction + savepoint (use a test user/fixture; do not alter production data).
BEGIN;
SAVEPOINT before_queue_change;
-- Example only: DELETE FROM matchmaking_queue WHERE player_id = :test_player_uuid;
ROLLBACK TO SAVEPOINT before_queue_change;
ROLLBACK;

-- Q10. Check constraints/data consistency summaries.
SELECT COUNT(*) AS invalid_player_records
FROM player_game_stats
WHERE wins + losses <> games_played OR peak_rating < rating OR rating NOT BETWEEN 100 AND 4000;
SELECT status, COUNT(*) AS match_count FROM matches GROUP BY status ORDER BY status;

-- Q11. Stored function signature for Elo result finalization; the API calls this inside a transaction.
-- SELECT * FROM finalize_match(:match_uuid, :winner_player_uuid);

-- Optional negative test (run manually in a disposable database): UPDATE/DELETE against rating_history should raise an exception from trg_rating_history_append_only.
-- UPDATE rating_history SET delta = delta WHERE id = (SELECT id FROM rating_history LIMIT 1);

-- Q12. Query PostgreSQL indexes and view definition for viva inspection.
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN
  ('matchmaking_queue', 'matches', 'rating_history', 'player_profiles', 'player_game_stats')
ORDER BY tablename, indexname;
