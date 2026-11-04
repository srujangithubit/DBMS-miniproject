import { MongoClient, type Db } from 'mongodb';

const globalForMongo = globalThis as unknown as {
  mongoClientPromise?: Promise<MongoClient>;
};

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is missing. Copy .env.example to .env and configure it.');
  if (!globalForMongo.mongoClientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5_000 });
    globalForMongo.mongoClientPromise = client.connect();
  }
  return globalForMongo.mongoClientPromise;
}

export async function getMongoDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(process.env.MONGODB_DB || 'esports_audit');
}

export type AuditEvent = {
  actorId?: string | null;
  actorUsername?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  createdAt?: Date;
};

export async function writeAuditEvent(event: AuditEvent): Promise<void> {
  const db = await getMongoDb();
  await db.collection('audit_events').insertOne({
    ...event,
    actorId: event.actorId ?? null,
    actorUsername: event.actorUsername ?? null,
    entityId: event.entityId ?? null,
    details: event.details ?? {},
    createdAt: event.createdAt ?? new Date()
  });
}

export async function readRecentAuditEvents(limit = 8) {
  const db = await getMongoDb();
  return db.collection('audit_events')
    .find({}, { projection: { _id: 0, actorId: 1, actorUsername: 1, action: 1, entityType: 1, entityId: 1, details: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}
