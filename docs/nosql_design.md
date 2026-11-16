# MongoDB / NoSQL Design

## Why a NoSQL database is useful here

Competitive matches have stable transactional facts (participants, winner, Elo changes) and evolving operational detail. Match telemetry may vary by game: a tactical FPS may produce map, rounds, assists, plants and defuses; a sports title may produce goals, saves and possession. Adding every possible attribute to a relational table would create many nullable columns and migrations. MongoDB stores these variable details as documents while PostgreSQL remains authoritative for identity, ranking, queue state and results.

## Database and collections

Database: `esports_audit` (configurable using `MONGODB_DB`).

### `audit_events`

Example document:

```json
{
  "actorId": "<PostgreSQL user UUID>",
  "actorUsername": "admin",
  "action": "match.result_finalized",
  "entityType": "match",
  "entityId": "<PostgreSQL match UUID>",
  "details": {
    "winnerId": "<player UUID>",
    "playerANewRating": 1016,
    "playerBNewRating": 984
  },
  "createdAt": "2026-10-21T10:00:00.000Z"
}
```

Actions emitted by the API include registration, login/logout, queue join/leave, match creation and result finalization. Documents are append-only from application workflows; the SQL match record remains the authority for the actual official result. Audit failure is logged on the server and does not roll back a committed SQL operation.

### `match_telemetry`

Example document:

```json
{
  "matchId": "<PostgreSQL match UUID>",
  "gameSlug": "valorant",
  "source": "seed-demo",
  "createdAt": "2026-10-21T10:00:00.000Z",
  "durationSeconds": 1180,
  "map": "Ascent",
  "metrics": { "roundsPlayed": 21, "teamAObjectives": 4, "teamBObjectives": 3 },
  "note": "Synthetic demo telemetry; not a real match record."
}
```

`metrics` can evolve by game title without changes to the PostgreSQL relational schema. The PostgreSQL match UUID is stored as a string in MongoDB as an application-level reference; it is not a cross-database foreign key.

## Indexes

- `audit_events`: `{ actorId: 1, createdAt: -1 }` supports a user's recent activity.
- `audit_events`: `{ entityType: 1, entityId: 1, createdAt: -1 }` supports the history of a specific match/user/queue object.
- `match_telemetry`: `{ matchId: 1, createdAt: -1 }` supports loading telemetry by match.
- `match_telemetry`: `{ gameSlug: 1, createdAt: -1 }` supports recent telemetry by title.
- `audit_events.seedKey` has a sparse unique index used only for deterministic seed fixtures.

## Retrieval strategy

- The admin dashboard sorts `audit_events` by `createdAt` descending and limits the response to eight documents.
- Match telemetry is looked up by `matchId` or grouped by `gameSlug` for future game-specific analysis.
- Mongo aggregation can group action counts by `action` or game telemetry by `gameSlug`; example shell queries are in `docs/important_queries.sql` (PostgreSQL) and below.

```javascript
// Count event activity by action over the latest 30 days.
db.audit_events.aggregate([
  { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
  { $group: { _id: "$action", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]);

// Inspect recent telemetry documents for a title.
db.match_telemetry.find({ gameSlug: "valorant" }).sort({ createdAt: -1 }).limit(10);
```

## Consistency boundary

A relational database transaction cannot atomically commit a MongoDB insert in the same transaction here. The platform therefore defines PostgreSQL as the system of record and MongoDB as supporting activity/telemetry storage. The API performs best-effort audit writes after SQL commits. For production, use a transactional outbox table in PostgreSQL and a retrying worker to deliver audit events to MongoDB so events are not lost during a MongoDB outage.


## Aggregation demonstrations

The repository includes reusable, executable MongoDB aggregation pipelines in lib/mongo-analytics.mjs. The same pipeline builders are used by the live demo command and database integration tests.

1. **Activity by action:** The $match stage restricts events to a date window, $group counts events and distinct actors, $project formats the result, and $sort ranks activity types.
2. **Telemetry by game:** $group calculates match count and average duration/round count across flexible game-specific telemetry documents.
3. **Telemetry by map:** $match selects one game and $group compares match count and average duration for each map.

Start MongoDB and populate the seeded demonstration records, then run:

~~~bash
npm run demo:mongodb
~~~

The script reads MONGODB_URI and MONGODB_DB from .env, executes all three pipelines against the actual audit_events and match_telemetry collections, and prints JSON results. The interactive equivalent queries are in docs/nosql_examples.js. Seed-generated telemetry is synthetic demonstration data, not live game-server telemetry.

Automated aggregation-pipeline unit tests validate the pipeline shapes. MongoDB integration tests execute the same pipelines against temporary collections in a separate database. Set TEST_MONGODB_URI to a database whose name ends in _test; the integration test refuses other database names and drops only the uniquely named collections it creates.
