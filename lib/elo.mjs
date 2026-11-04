/** Elo calculation shared with unit tests. Production finalization runs in PostgreSQL. */
export function calculateElo(ratingA, ratingB, winner, kFactor = 32) {
  if (!Number.isInteger(ratingA) || !Number.isInteger(ratingB)) throw new TypeError('Ratings must be integers');
  if (ratingA < 100 || ratingA > 4000 || ratingB < 100 || ratingB > 4000) throw new RangeError('Ratings must be between 100 and 4000');
  if (winner !== 'A' && winner !== 'B') throw new TypeError("winner must be 'A' or 'B'");
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const scoreA = winner === 'A' ? 1 : 0;
  const newA = Math.max(100, Math.min(4000, Math.round(ratingA + kFactor * (scoreA - expectedA))));
  const newB = Math.max(100, Math.min(4000, Math.round(ratingB + kFactor * ((1 - scoreA) - expectedB))));
  return { newA, newB, deltaA: newA - ratingA, deltaB: newB - ratingB };
}
