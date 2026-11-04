import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateElo } from '../lib/elo.mjs';

test('equal-rated players: winner gains and loser loses approximately equal points', () => {
  const result = calculateElo(1000, 1000, 'A');
  assert.equal(result.newA, 1016);
  assert.equal(result.newB, 984);
  assert.equal(result.deltaA, 16);
  assert.equal(result.deltaB, -16);
});

test('upset victory changes rating more than an expected win', () => {
  const upset = calculateElo(900, 1500, 'A');
  const expected = calculateElo(1500, 900, 'A');
  assert.ok(upset.deltaA > expected.deltaA);
  assert.ok(upset.deltaB < expected.deltaB);
});

test('winner selection is validated', () => {
  assert.throws(() => calculateElo(1000, 1000, 'DRAW'), /winner/);
});

test('ratings are kept within database bounds', () => {
  const top = calculateElo(4000, 1000, 'A');
  const bottom = calculateElo(100, 4000, 'B');
  assert.equal(top.newA, 4000);
  assert.equal(bottom.newB, 4000);
  assert.ok(top.newB >= 100 && bottom.newA >= 100);
});
