// Run in mongosh after: use esports_audit
// Seeded telemetry is synthetic demonstration data.

// 1. Recent activity for one administrator.
db.audit_events.find({ actorUsername: "admin" }).sort({ createdAt: -1 }).limit(10);

// 2. Activity counts by action in the last 30 days, with unique actors.
const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
db.audit_events.aggregate([
  { $match: { createdAt: { $gte: since }, action: { $type: "string" } } },
  {
    $group: {
      _id: "$action",
      totalEvents: { $sum: 1 },
      latestEventAt: { $max: "$createdAt" },
      actorIds: { $addToSet: "$actorId" }
    }
  },
  {
    $project: {
      _id: 0,
      action: "$_id",
      totalEvents: 1,
      latestEventAt: 1,
      uniqueActors: {
        $size: {
          $filter: {
            input: "$actorIds",
            as: "actorId",
            cond: { $and: [{ $ne: ["$$actorId", null] }, { $ne: ["$$actorId", ""] }] }
          }
        }
      }
    }
  },
  { $sort: { totalEvents: -1, action: 1 } },
  { $limit: 10 }
]);

// 3. Flexible telemetry averages grouped by game.
db.match_telemetry.aggregate([
  {
    $group: {
      _id: "$gameSlug",
      matchCount: { $sum: 1 },
      averageDurationSeconds: { $avg: "$durationSeconds" },
      averageRoundsPlayed: { $avg: "$metrics.roundsPlayed" },
      latestMatchAt: { $max: "$createdAt" }
    }
  },
  {
    $project: {
      _id: 0,
      gameSlug: "$_id",
      matchCount: 1,
      averageDurationSeconds: { $round: ["$averageDurationSeconds", 1] },
      averageRoundsPlayed: { $round: ["$averageRoundsPlayed", 1] },
      latestMatchAt: 1
    }
  },
  { $sort: { matchCount: -1, gameSlug: 1 } }
]);

// 4. Match counts and average duration by map for Valorant.
db.match_telemetry.aggregate([
  { $match: { gameSlug: "valorant" } },
  {
    $group: {
      _id: "$map",
      matchCount: { $sum: 1 },
      averageDurationSeconds: { $avg: "$durationSeconds" }
    }
  },
  {
    $project: {
      _id: 0,
      map: "$_id",
      matchCount: 1,
      averageDurationSeconds: { $round: ["$averageDurationSeconds", 1] }
    }
  },
  { $sort: { matchCount: -1, map: 1 } }
]);

// 5. Inspect the indexes created by the seed routine.
db.audit_events.getIndexes();
db.match_telemetry.getIndexes();
