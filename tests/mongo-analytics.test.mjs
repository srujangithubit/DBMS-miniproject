import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuditSummaryPipeline,
  buildTelemetrySummaryPipeline,
  buildMapTelemetrySummaryPipeline
} from '../lib/mongo-analytics.mjs';

test('audit aggregation groups events by action and counts distinct actors', () => {
  const since = new Date('2026-01-01T00:00:00.000Z');
  const pipeline = buildAuditSummaryPipeline(since);
  assert.deepEqual(pipeline[0], { $match: { createdAt: { $gte: since }, action: { $type: 'string' } } });
  assert.ok(pipeline.some((stage) => stage.$group?.totalEvents?.$sum === 1));
  assert.ok(pipeline.some((stage) => stage.$sort?.totalEvents === -1));
  assert.ok(pipeline.some((stage) => stage.$limit === 10));
});

test('telemetry pipelines group metrics by game and by selected map', () => {
  const byGame = buildTelemetrySummaryPipeline();
  const byMap = buildMapTelemetrySummaryPipeline('valorant');
  assert.ok(byGame.some((stage) => stage.$group?.matchCount?.$sum === 1));
  assert.ok(byGame.some((stage) => stage.$group?.averageDurationSeconds?.$avg === '$durationSeconds'));
  assert.deepEqual(byMap[0], { $match: { gameSlug: 'valorant' } });
  assert.ok(byMap.some((stage) => stage.$group?._id === '$map'));
});

test('aggregation builders reject invalid filters', () => {
  assert.throws(() => buildAuditSummaryPipeline('not-a-date'), /valid Date/);
  assert.throws(() => buildMapTelemetrySummaryPipeline('  '), /non-empty string/);
});
