import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateElo } from '../lib/elo.mjs';

test('equal-rated players: player A win changes ratings by +16 and -16', () => {
  assert.deepEqual(calculateElo(1000, 1000, 'A'), {
    newA: 1016, newB: 984, deltaA: 16, deltaB: -16
  });
});

test('equal-rated players: player B win is symmetric', () => {
  assert.deepEqual(calculateElo(1000, 1000, 'B'), {
    newA: 984, newB: 1016, deltaA: -16, deltaB: 16
  });
});

test('an underdog victory changes the winner rating more than an expected victory', () => {
  const upset = calculateElo(900, 1500, 'A');
  const expectedWin = calculateElo(1500, 900, 'A');
  assert.ok(upset.deltaA > expectedWin.deltaA);
  assert.ok(upset.deltaB < expectedWin.deltaB);
});

test('a favorite receives a smaller rating gain for an expected win', () => {
  const favoriteWin = calculateElo(1500, 900, 'A');
  const underdogWin = calculateElo(900, 1500, 'A');
  assert.ok(favoriteWin.deltaA < underdogWin.deltaA);
});

test('winner must be exactly A or B', () => {
  for (const winner of ['DRAW', 'C', '', null, undefined, 1]) {
    assert.throws(() => calculateElo(1000, 1000, winner), /winner/);
  }
});

test('ratings must be integers', () => {
  assert.throws(() => calculateElo(1000.5, 1000, 'A'), /integers/);
  assert.throws(() => calculateElo(1000, '1000', 'A'), /integers/);
  assert.throws(() => calculateElo(NaN, 1000, 'A'), /integers/);
});

test('ratings outside the database range are rejected', () => {
  assert.throws(() => calculateElo(99, 1000, 'A'), /between 100 and 4000/);
  assert.throws(() => calculateElo(1000, 4001, 'A'), /between 100 and 4000/);
});

test('rating changes are clamped to the supported database bounds', () => {
  const top = calculateElo(4000, 1000, 'A');
  const bottom = calculateElo(100, 4000, 'B');
  assert.equal(top.newA, 4000);
  assert.equal(bottom.newB, 4000);
  assert.ok(top.newB >= 100);
  assert.ok(bottom.newA >= 100);
});

test('rating deltas are zero-sum when neither rating is at a clamp boundary', () => {
  for (const [a, b] of [[1000, 1000], [900, 1500], [1800, 1200], [2200, 2100]]) {
    for (const winner of ['A', 'B']) {
      const result = calculateElo(a, b, winner);
      assert.equal(result.deltaA + result.deltaB, 0, `${a} vs ${b}, winner ${winner}`);
    }
  }
});

test('swapping player order preserves the corresponding rating outcomes', () => {
  const original = calculateElo(1230, 1475, 'A');
  const swapped = calculateElo(1475, 1230, 'B');
  assert.equal(original.newA, swapped.newB);
  assert.equal(original.newB, swapped.newA);
});

test('a custom positive K-factor changes the magnitude of rating movement', () => {
  const standard = calculateElo(1000, 1000, 'A');
  const faster = calculateElo(1000, 1000, 'A', 40);
  assert.equal(faster.deltaA, 20);
  assert.ok(faster.deltaA > standard.deltaA);
});

test('K-factor must be finite, positive, and no greater than 100', () => {
  for (const value of [0, -1, 101]) {
    assert.throws(() => calculateElo(1000, 1000, 'A', value), /K-factor/);
  }
  for (const value of [NaN, Infinity, '32']) {
    assert.throws(() => calculateElo(1000, 1000, 'A', value), /K-factor/);
  }
});
