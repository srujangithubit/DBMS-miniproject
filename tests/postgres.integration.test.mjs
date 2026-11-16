import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.TEST_DATABASE_URL;
let pool;

before(async () => {
  if (!databaseUrl) return;
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  if (!/_test$/i.test(databaseName)) {
    throw new Error("Refusing to run PostgreSQL integration tests unless TEST_DATABASE_URL targets a database ending in _test.");
  }
  const { default: pg } = await import('pg');
  pool = new pg.Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000 });
  await pool.query('SELECT 1');
  const schema = await pool.query("SELECT to_regclass('public.matches') AS matches, to_regclass('public.player_game_stats') AS stats");
  if (!schema.rows[0].matches || !schema.rows[0].stats) {
    throw new Error('Apply db/schema.sql to the dedicated test database before running integration tests.');
  }
});

after(async () => {
  await pool?.end();
});

async function withFixture(run) {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const game = await client.query(
      "INSERT INTO games (slug, name, genre, is_active) VALUES ($1, $2, 'Test', TRUE) RETURNING id",
      ['test-' + suffix, 'Integration Test ' + suffix]
    );
    const season = await client.query(
      "INSERT INTO seasons (name, starts_on, ends_on, is_active) VALUES ($1, CURRENT_DATE - 1, CURRENT_DATE + 30, FALSE) RETURNING id",
      ['Integration Test Season ' + suffix]
    );
    const playerIds = [];
    for (const label of ['a', 'b']) {
      const username = 'it_' + label + '_' + suffix;
      const user = await client.query(
        "INSERT INTO app_users (username, email, password_hash, role) VALUES ($1, $2, 'integration-test-only', 'PLAYER') RETURNING id",
        [username, username + '@example.invalid']
      );
      const playerId = user.rows[0].id;
      await client.query(
        'INSERT INTO player_profiles (user_id, display_name) VALUES ($1, $2)',
        [playerId, 'Integration ' + label.toUpperCase() + ' ' + suffix]
      );
      await client.query(
        'INSERT INTO player_game_stats (player_id, game_id, season_id, rating, peak_rating) VALUES ($1, $2, $3, 1000, 1000)',
        [playerId, game.rows[0].id, season.rows[0].id]
      );
      playerIds.push(playerId);
    }
    const match = await client.query(
      "INSERT INTO matches (game_id, season_id, player_a_id, player_b_id, status) VALUES ($1, $2, $3, $4, 'PENDING') RETURNING id",
      [game.rows[0].id, season.rows[0].id, playerIds[0], playerIds[1]]
    );
    await run(client, {
      gameId: game.rows[0].id,
      seasonId: season.rows[0].id,
      playerAId: playerIds[0],
      playerBId: playerIds[1],
      matchId: match.rows[0].id
    });
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

const integrationTest = (name, run) => test(name, { skip: !databaseUrl }, run);

integrationTest('finalize_match updates both players and inserts exactly two history rows', async () => {
  await withFixture(async (client, fixture) => {
    const result = await client.query(
      'SELECT * FROM finalize_match($1::uuid, $2::uuid)',
      [fixture.matchId, fixture.playerAId]
    );
    assert.equal(result.rows[0].player_a_new_rating, 1016);
    assert.equal(result.rows[0].player_b_new_rating, 984);

    const stats = await client.query(
      'SELECT player_id, wins, losses, games_played FROM player_game_stats WHERE player_id IN ($1, $2) AND game_id = $3 AND season_id = $4',
      [fixture.playerAId, fixture.playerBId, fixture.gameId, fixture.seasonId]
    );
    assert.equal(stats.rows.reduce((sum, row) => sum + row.games_played, 0), 2);
    assert.equal(stats.rows.reduce((sum, row) => sum + row.wins, 0), 1);
    assert.equal(stats.rows.reduce((sum, row) => sum + row.losses, 0), 1);

    const history = await client.query('SELECT COUNT(*)::int AS count FROM rating_history WHERE match_id = $1', [fixture.matchId]);
    const match = await client.query('SELECT status FROM matches WHERE id = $1', [fixture.matchId]);
    assert.equal(history.rows[0].count, 2);
    assert.equal(match.rows[0].status, 'COMPLETED');
  });
});

integrationTest('an invalid winner is rejected without changing the pending match or ratings', async () => {
  await withFixture(async (client, fixture) => {
    await client.query('SAVEPOINT before_invalid_winner');
    await assert.rejects(
      client.query('SELECT * FROM finalize_match($1::uuid, $2::uuid)', [fixture.matchId, randomUUID()]),
      /Winner must be one of the two match participants/
    );
    await client.query('ROLLBACK TO SAVEPOINT before_invalid_winner');

    const state = await client.query(
      'SELECT m.status, COUNT(rh.id)::int AS history_count FROM matches m LEFT JOIN rating_history rh ON rh.match_id = m.id WHERE m.id = $1 GROUP BY m.id',
      [fixture.matchId]
    );
    assert.equal(state.rows[0].status, 'PENDING');
    assert.equal(state.rows[0].history_count, 0);
  });
});

integrationTest('a match cannot be finalized twice or increment statistics twice', async () => {
  await withFixture(async (client, fixture) => {
    await client.query('SELECT * FROM finalize_match($1::uuid, $2::uuid)', [fixture.matchId, fixture.playerAId]);
    await client.query('SAVEPOINT before_duplicate_finalize');
    await assert.rejects(
      client.query('SELECT * FROM finalize_match($1::uuid, $2::uuid)', [fixture.matchId, fixture.playerAId]),
      /Only PENDING matches can be finalized/
    );
    await client.query('ROLLBACK TO SAVEPOINT before_duplicate_finalize');

    const stats = await client.query(
      'SELECT SUM(games_played)::int AS games_played FROM player_game_stats WHERE player_id IN ($1, $2) AND game_id = $3 AND season_id = $4',
      [fixture.playerAId, fixture.playerBId, fixture.gameId, fixture.seasonId]
    );
    const history = await client.query('SELECT COUNT(*)::int AS count FROM rating_history WHERE match_id = $1', [fixture.matchId]);
    assert.equal(stats.rows[0].games_played, 2);
    assert.equal(history.rows[0].count, 2);
  });
});

integrationTest('rating history rejects updates and preserves the original audit rows', async () => {
  await withFixture(async (client, fixture) => {
    await client.query('SELECT * FROM finalize_match($1::uuid, $2::uuid)', [fixture.matchId, fixture.playerAId]);
    await client.query('SAVEPOINT before_history_update');
    await assert.rejects(
      client.query('UPDATE rating_history SET delta = delta WHERE match_id = $1', [fixture.matchId]),
      /append-only/
    );
    await client.query('ROLLBACK TO SAVEPOINT before_history_update');
    const history = await client.query('SELECT COUNT(*)::int AS count FROM rating_history WHERE match_id = $1', [fixture.matchId]);
    assert.equal(history.rows[0].count, 2);
  });
});
