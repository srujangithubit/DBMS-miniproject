// Run inside mongosh after selecting the esports_audit database.
// 1. Recent activity events for one actor:
db.audit_events.find({ actorUsername: "admin" }).sort({ createdAt: -1 }).limit(10);

// 2. Count event types in the last 30 days:
db.audit_events.aggregate([
  { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
  { $group: { _id: "$action", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]);

// 3. Recent telemetry by title:
db.match_telemetry.find({ gameSlug: "valorant" }).sort({ createdAt: -1 }).limit(10);

// 4. Flexible metrics summary by map (fields may vary from title to title):
db.match_telemetry.aggregate([
  { $match: { gameSlug: "valorant" } },
  { $group: { _id: "$map", matches: { $sum: 1 }, avgDuration: { $avg: "$durationSeconds" } } },
  { $sort: { matches: -1 } }
]);
