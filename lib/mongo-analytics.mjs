const DAY_IN_MS = 24 * 60 * 60 * 1000;

function requireDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('since must be a valid Date');
  }
}

function requireGameSlug(gameSlug) {
  if (typeof gameSlug !== 'string' || gameSlug.trim().length === 0) {
    throw new TypeError('gameSlug must be a non-empty string');
  }
}

/** Summarize event volume and distinct actors over a caller-supplied time window. */
export function buildAuditSummaryPipeline(since = new Date(Date.now() - 30 * DAY_IN_MS)) {
  requireDate(since);
  return [
    { $match: { createdAt: { $gte: since }, action: { $type: 'string' } } },
    {
      $group: {
        _id: '$action',
        totalEvents: { $sum: 1 },
        latestEventAt: { $max: '$createdAt' },
        actorIds: { $addToSet: '$actorId' }
      }
    },
    {
      $project: {
        _id: 0,
        action: '$_id',
        totalEvents: 1,
        latestEventAt: 1,
        uniqueActors: {
          $size: {
            $filter: {
              input: '$actorIds',
              as: 'actorId',
              cond: { $and: [{ $ne: ['$$actorId', null] }, { $ne: ['$$actorId', ''] }] }
            }
          }
        }
      }
    },
    { $sort: { totalEvents: -1, action: 1 } },
    { $limit: 10 }
  ];
}

/** Summarize match count and average duration/rounds for each game. */
export function buildTelemetrySummaryPipeline() {
  return [
    {
      $group: {
        _id: '$gameSlug',
        matchCount: { $sum: 1 },
        averageDurationSeconds: { $avg: '$durationSeconds' },
        averageRoundsPlayed: { $avg: '$metrics.roundsPlayed' },
        latestMatchAt: { $max: '$createdAt' }
      }
    },
    {
      $project: {
        _id: 0,
        gameSlug: '$_id',
        matchCount: 1,
        averageDurationSeconds: { $round: ['$averageDurationSeconds', 1] },
        averageRoundsPlayed: { $round: ['$averageRoundsPlayed', 1] },
        latestMatchAt: 1
      }
    },
    { $sort: { matchCount: -1, gameSlug: 1 } }
  ];
}

/** Summarize map usage for one game; telemetry fields remain game-specific. */
export function buildMapTelemetrySummaryPipeline(gameSlug) {
  requireGameSlug(gameSlug);
  return [
    { $match: { gameSlug } },
    {
      $group: {
        _id: '$map',
        matchCount: { $sum: 1 },
        averageDurationSeconds: { $avg: '$durationSeconds' }
      }
    },
    {
      $project: {
        _id: 0,
        map: '$_id',
        matchCount: 1,
        averageDurationSeconds: { $round: ['$averageDurationSeconds', 1] }
      }
    },
    { $sort: { matchCount: -1, map: 1 } }
  ];
}
