import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { MongoClient } from 'mongodb';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || 'esports_audit';
if (!mongoUri) throw new Error('MONGODB_URI is missing. Copy .env.example to .env first.');

const players = [
  { username: 'player1', email: 'player1@esports.local', password: 'Player123!', displayName: 'NovaStrike', region: 'APAC', bio: 'Entry fragger who likes tactical rounds.' },
  { username: 'player2', email: 'player2@esports.local', password: 'Player123!', displayName: 'PixelRift', region: 'APAC', bio: 'Methodical player focused on team utility.' },
  { username: 'player3', email: 'player3@esports.local', password: 'Player123!', displayName: 'EchoViper', region: 'EU', bio: 'Competitive player looking to climb the ladder.' },
  { username: 'player4', email: 'player4@esports.local', password: 'Player123!', displayName: 'ClutchMode', region: 'NA', bio: 'Late-round specialist and calm shot-caller.' },
  { username: 'player5', email: 'player5@esports.local', password: 'Player123!', displayName: 'ZenithGG', region: 'APAC', bio: 'Flexible player interested in ranked matches.' }
];

async function upsertUser(client, account) {
  const passwordHash = await bcrypt.hash(account.password, 12);
  const { rows } = await client.query(
    `INSERT INTO app_users (username, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username,
       password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_active = TRUE
     RETURNING id, username, email, role`,
    [account.username, account.email, passwordHash, account.role]
  );
  if (account.role === 'PLAYER') {
    await client.query(
      `INSERT INTO player_profiles (user_id, display_name, region, bio)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name,
         region = EXCLUDED.region, bio = EXCLUDED.bio`,
      [rows[0].id, account.displayName, account.region || 'APAC', account.bio || '']
    );
  }
  return rows[0];
}

async function main() {
  const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 8000 });
  await mongoClient.connect();
  const dbClient = await pool.connect();
  const mongo = mongoClient.db(mongoDbName);
  const audit = mongo.collection('audit_events');
  const telemetry = mongo.collection('match_telemetry');
  await audit.createIndex({ actorId: 1, createdAt: -1 });
  await audit.createIndex({ entityType: 1, entityId: 1, createdAt: -1 });
  await audit.createIndex({ seedKey: 1 }, { unique: true, sparse: true });
  await telemetry.createIndex({ matchId: 1, createdAt: -1 });
  await telemetry.createIndex({ gameSlug: 1, createdAt: -1 });

  let activeSeason;
  let games;
  const seededPlayers = [];
  let createdFixtureIds = [];

  await dbClient.query('BEGIN');
  try {
    await dbClient.query('UPDATE seasons SET is_active = FALSE WHERE is_active = TRUE');
    const seasonResult = await dbClient.query(
      `INSERT INTO seasons (name, starts_on, ends_on, is_active)
       VALUES ('Season 1 - Fall 2026', CURRENT_DATE - 30, CURRENT_DATE + 90, TRUE)
       ON CONFLICT (name) DO UPDATE SET starts_on = EXCLUDED.starts_on,
         ends_on = EXCLUDED.ends_on, is_active = TRUE
       RETURNING id, name, starts_on, ends_on`
    );
    activeSeason = seasonResult.rows[0];

    const gameDefinitions = [
      ['valorant', 'VALORANT', 'Tactical FPS'],
      ['counter-strike-2', 'Counter-Strike 2', 'Tactical FPS'],
      ['rocket-league', 'Rocket League', 'Sports / Vehicle']
    ];
    for (const [slug, name, genre] of gameDefinitions) {
      await dbClient.query(
        `INSERT INTO games (slug, name, genre, is_active) VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, genre = EXCLUDED.genre, is_active = TRUE`,
        [slug, name, genre]
      );
    }
    const gameResult = await dbClient.query('SELECT id, slug, name FROM games WHERE is_active = TRUE ORDER BY id');
    games = gameResult.rows;

    const admin = await upsertUser(dbClient, {
      username: 'admin', email: 'admin@esports.local', password: 'Admin123!', role: 'ADMIN'
    });
    for (const player of players) {
      const user = await upsertUser(dbClient, { ...player, role: 'PLAYER' });
      seededPlayers.push({ ...user, displayName: player.displayName, baseRating: [1050, 1120, 980, 1300, 1000][players.indexOf(player)] });
    }

    for (const player of seededPlayers) {
      for (const [gameIndex, game] of games.entries()) {
        const rating = Math.max(800, Math.min(1800, player.baseRating + gameIndex * 15));
        await dbClient.query(
          `INSERT INTO player_game_stats (player_id, game_id, season_id, rating, peak_rating)
           VALUES ($1, $2, $3, $4, $4) ON CONFLICT (player_id, game_id, season_id) DO NOTHING`,
          [player.id, game.id, activeSeason.id, rating]
        );
      }
    }

    const countResult = await dbClient.query('SELECT COUNT(*)::INTEGER AS count FROM matches');
    if (Number(countResult.rows[0].count) === 0 && seededPlayers.length >= 4 && games.length) {
      const gameId = games[0].id;
      const fixtureSpecs = [
        [seededPlayers[0], seededPlayers[1], seededPlayers[0]],
        [seededPlayers[1], seededPlayers[2], seededPlayers[1]],
        [seededPlayers[2], seededPlayers[3], seededPlayers[3]],
        [seededPlayers[0], seededPlayers[3], seededPlayers[3]],
        [seededPlayers[1], seededPlayers[4], seededPlayers[1]],
        [seededPlayers[4], seededPlayers[2], seededPlayers[4]]
      ];
      for (const [a, b, winner] of fixtureSpecs) {
        const match = await dbClient.query(
          `INSERT INTO matches (game_id, season_id, player_a_id, player_b_id, status)
           VALUES ($1, $2, $3, $4, 'PENDING') RETURNING id`,
          [gameId, activeSeason.id, a.id, b.id]
        );
        const matchId = match.rows[0].id;
        await dbClient.query('SELECT * FROM finalize_match($1::uuid, $2::uuid)', [matchId, winner.id]);
        createdFixtureIds.push({ id: matchId, a, b, winner, game: games.find((g) => Number(g.id) === Number(gameId)) });
      }
    }
    await dbClient.query('COMMIT');

    // MongoDB is intentionally used for flexible telemetry and append-only activity events.
    const now = new Date();
    const demoEvents = [
      { seedKey: 'seed-event-queue', actorId: seededPlayers[0]?.id, actorUsername: 'player1', action: 'matchmaking.queue_joined', entityType: 'queue', details: { game: games[0]?.name, note: 'Demo event for the activity feed.' } },
      { seedKey: 'seed-event-match', actorId: admin.id, actorUsername: 'admin', action: 'match.result_finalized', entityType: 'match', details: { note: 'Seeded demonstration result.' } },
      { seedKey: 'seed-event-registration', actorId: seededPlayers[1]?.id, actorUsername: 'player2', action: 'auth.register', entityType: 'user', details: { note: 'Seeded demonstration registration.' } }
    ];
    for (let i = 0; i < demoEvents.length; i++) {
      const event = demoEvents[i];
      await audit.updateOne(
        { seedKey: event.seedKey },
        { $setOnInsert: { ...event, createdAt: new Date(now.getTime() - (i + 1) * 60_000) } },
        { upsert: true }
      );
    }
    for (const [fixtureIndex, fixture] of createdFixtureIds.entries()) {
      await telemetry.updateOne(
        { matchId: String(fixture.id), source: 'seed-demo' },
        { $setOnInsert: {
          matchId: String(fixture.id), gameSlug: fixture.game?.slug || 'unknown', source: 'seed-demo',
          createdAt: now, durationSeconds: 900 + fixtureIndex * 75,
          map: ['Ascent', 'Bind', 'Haven'][fixtureIndex % 3],
          metrics: { roundsPlayed: 21, teamAObjectives: 4, teamBObjectives: 3 },
          note: 'Illustrative flexible game telemetry; values are synthetic and for demonstration only.'
        } },
        { upsert: true }
      );
    }

    console.log('Seed completed.');
    console.log(`Active season: ${activeSeason.name}`);
    console.log(`Games: ${games.map((game) => game.name).join(', ')}`);
    console.log('Demo admin: admin@esports.local / Admin123!');
    console.log('Demo player: player1@esports.local / Player123!');
    console.log(`New sample matches created: ${createdFixtureIds.length}`);
  } catch (error) {
    await dbClient.query('ROLLBACK');
    throw error;
  } finally {
    dbClient.release();
    await mongoClient.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Seed script failed:', error);
  process.exitCode = 1;
});
