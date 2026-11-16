import 'dotenv/config';
import { MongoClient } from 'mongodb';
import {
  buildAuditSummaryPipeline,
  buildTelemetrySummaryPipeline,
  buildMapTelemetrySummaryPipeline
} from '../lib/mongo-analytics.mjs';

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'esports_audit';
if (!uri) {
  throw new Error('MONGODB_URI is missing. Copy .env.example to .env and configure MongoDB first.');
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

try {
  await client.connect();
  const database = client.db(databaseName);
  const auditEvents = database.collection('audit_events');
  const telemetry = database.collection('match_telemetry');
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [auditSummary, telemetryByGame, valorantByMap] = await Promise.all([
    auditEvents.aggregate(buildAuditSummaryPipeline(since)).toArray(),
    telemetry.aggregate(buildTelemetrySummaryPipeline()).toArray(),
    telemetry.aggregate(buildMapTelemetrySummaryPipeline('valorant')).toArray()
  ]);

  console.log(`MongoDB aggregation demonstration — database: ${databaseName}`);
  console.log(`Audit events since ${since.toISOString()} (grouped by action):`);
  console.log(JSON.stringify(auditSummary, null, 2));
  console.log('\nMatch telemetry (grouped by game):');
  console.log(JSON.stringify(telemetryByGame, null, 2));
  console.log('\nValorant telemetry (grouped by map):');
  console.log(JSON.stringify(valorantByMap, null, 2));
  console.log('\nNote: seeded telemetry is synthetic demonstration data.');
} finally {
  await client.close();
}
