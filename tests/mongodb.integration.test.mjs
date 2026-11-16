import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  buildAuditSummaryPipeline,
  buildTelemetrySummaryPipeline,
  buildMapTelemetrySummaryPipeline
} from '../lib/mongo-analytics.mjs';

const mongoUri = process.env.TEST_MONGODB_URI;
let client;
let database;

before(async () => {
  if (!mongoUri) return;
  const databaseName = decodeURIComponent(new URL(mongoUri).pathname.replace(/^\//, ''));
  if (!/_test$/i.test(databaseName)) {
    throw new Error(`Refusing to run MongoDB integration tests against '${databaseName}'. TEST_MONGODB_URI must select a database ending in _test.`);
  }
  const { MongoClient } = await import('mongodb');
  client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  database = client.db();
});

after(async () => {
  await client?.close();
});

async function withCollection(prefix, run) {
  const collectionName = `${prefix}_${randomUUID().replaceAll('-', '')}`;
  const collection = database.collection(collectionName);
  try {
    await run(collection);
  } finally {
    await collection.drop().catch(() => {});
  }
}

const integrationTest = (name, run) => test(name, { skip: !mongoUri }, run);

integrationTest('audit aggregation returns action counts, latest timestamp and unique actors', async () => {
  await withCollection('audit_integration', async (collection) => {
    const createdAt = new Date('2026-11-01T10:00:00.000Z');
    await collection.insertMany([
      { action: 'auth.login', actorId: 'player-a', createdAt },
      { action: 'auth.login', actorId: 'player-b', createdAt: new Date(createdAt.getTime() + 1000) },
      { action: 'matchmaking.queue_joined', actorId: 'player-a', createdAt: new Date(createdAt.getTime() + 2000) }
    ]);
    const results = await collection.aggregate(buildAuditSummaryPipeline(new Date('2026-10-01T00:00:00.000Z'))).toArray();
    const login = results.find((row) => row.action === 'auth.login');
    assert.equal(login.totalEvents, 2);
    assert.equal(login.uniqueActors, 2);
    assert.equal(login.latestEventAt.toISOString(), '2026-11-01T10:00:01.000Z');
  });
});

integrationTest('telemetry aggregations summarize games and maps from flexible documents', async () => {
  await withCollection('telemetry_integration', async (collection) => {
    await collection.insertMany([
      { gameSlug: 'valorant', map: 'Ascent', durationSeconds: 100, metrics: { roundsPlayed: 20 }, createdAt: new Date() },
      { gameSlug: 'valorant', map: 'Ascent', durationSeconds: 200, metrics: { roundsPlayed: 22 }, createdAt: new Date() },
      { gameSlug: 'counter-strike-2', map: 'Mirage', durationSeconds: 300, metrics: { roundsPlayed: 24 }, createdAt: new Date() }
    ]);
    const gameSummary = await collection.aggregate(buildTelemetrySummaryPipeline()).toArray();
    const valorant = gameSummary.find((row) => row.gameSlug === 'valorant');
    assert.equal(valorant.matchCount, 2);
    assert.equal(valorant.averageDurationSeconds, 150);
    assert.equal(valorant.averageRoundsPlayed, 21);

    const mapSummary = await collection.aggregate(buildMapTelemetrySummaryPipeline('valorant')).toArray();
    assert.equal(mapSummary.length, 1);
    assert.equal(mapSummary[0].map, 'Ascent');
    assert.equal(mapSummary[0].matchCount, 2);
  });
});
