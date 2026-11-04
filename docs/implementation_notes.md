# Implementation Notes

## Business rules

- Elo rating is keyed by player + game + season, not globally across different games.
- Only one season may be active at a time; a player profile gets an initial 1000 Elo row for each enabled game in the active season during registration.
- A queue entry stores the player's Elo at join time. The default pairing band is 300 points each direction.
- A queue join may result in a queue entry or a pending match. The user receives a response that describes the resulting state.
- Only an administrator can finalize a pending match. Result finalization must specify one of the participants as winner.
- One successful finalized match changes exactly two player-game-season records and creates two unique rating-history rows. A database trigger rejects UPDATE/DELETE on rating_history, and restrictive foreign keys preserve the audit trail.
- MongoDB activity logging happens after the PostgreSQL transaction. If MongoDB is down, the business operation can still succeed; the server logs the audit failure. Production hardening should use an outbox/retry process.

## Seed data

The seed script creates three game titles, one active season, one admin account, five player accounts, per-title rating rows, six completed illustrative matches, MongoDB indexes, sample activity events and synthetic telemetry documents. Sample fixture matches are created only when the SQL `matches` table is empty. The fixture data is for interface/database demonstration and should not be described as real competition history.

## Common troubleshooting

- **API says database config is missing:** ensure `.env` exists in the project root and variable names match `.env.example`.
- **PostgreSQL container is healthy but tables are absent:** the init script runs only when the volume is first created. Apply `db/schema.sql` manually or reset the disposable volume and reseed.
- **`npm run seed` cannot connect:** wait for both Docker services to pass health checks; confirm `5432` and `27017` are not occupied by unrelated local databases.
- **Session signing error:** set `SESSION_SECRET` to a random string with at least 32 characters and restart the Next.js server.
- **Player not matched:** ensure another player has joined the same game and active season, and their rating gap is no greater than 300.
- **No admin button:** sign out and use `admin@esports.local`; only `ADMIN` can see the admin console and finalize results.
