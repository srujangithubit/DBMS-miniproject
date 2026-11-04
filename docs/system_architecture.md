# System Architecture and Data Flow

## Components

1. **Next.js browser UI**: login/register, dashboard, searchable leaderboard, queue controls, match history and role-aware admin console.
2. **Next.js Route Handlers**: input validation, session verification, role checks, PostgreSQL SQL and MongoDB document access.
3. **PostgreSQL**: source of truth for accounts, games, seasons, profiles, per-season ratings, queue, matches and rating history. Implements constraints, indexes, triggers, a view and Elo stored function.
4. **MongoDB**: flexible event documents and match telemetry; queried by the admin activity panel.
5. **Docker Compose**: reproducible local database services with named volumes and health checks.

## Main data flow: matchmaking

1. A signed-in `PLAYER` chooses a game and calls `POST /api/queue/join`.
2. The API begins a PostgreSQL transaction and validates the active game/season.
3. It creates the rating row if it does not exist, reads the current Elo and searches the queue for a compatible opponent in the same game/season within the default ±300 rating window.
4. The candidate query sorts by absolute rating gap and then queue age, locking the selected queue row with `SKIP LOCKED` to reduce concurrent duplicate pairing.
5. If a candidate exists, the API creates a `PENDING` match and deletes both queue entries; otherwise, it inserts the current player into the queue.
6. The transaction commits; an activity event is written to MongoDB on a best-effort basis.

## Main data flow: result finalization

1. An authenticated `ADMIN` selects a winner for a pending match.
2. The API begins a transaction and calls `SELECT * FROM finalize_match(match_id, winner_id)`.
3. The PostgreSQL function locks the match and both per-game/per-season rating rows, validates the winner, computes Elo updates, increments W/L/game counters, inserts two `rating_history` rows, and marks the match completed with before/after ratings.
4. If any condition fails, the transaction rolls back; the match remains unchanged.
5. After commit, the API writes a MongoDB activity event. The leaderboard view immediately reflects the new rankings.

## API inventory

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Validate input; create a player identity/profile and initial active-season stats |
| POST | `/api/auth/login` | Public | Verify bcrypt password and create HTTP-only session cookie |
| POST | `/api/auth/logout` | Signed in | Clear session cookie |
| GET | `/api/auth/me` | Public/session-aware | Report the current session |
| GET | `/api/dashboard?gameId=1` | Signed in | Load profile stats, leaderboard, matches, queue state and admin audit data |
| GET | `/api/players?q=...&gameId=1` | Signed in | Search players/leaderboard |
| POST | `/api/queue/join` | Player | Create queue entry or match a compatible opponent |
| POST | `/api/queue/leave` | Player | Remove own queue entry |
| POST | `/api/matches/{id}/result` | Admin | Finalize a match result and Elo deltas |

## Configuration and secrets

`DATABASE_URL`, `MONGODB_URI`, `MONGODB_DB`, `SESSION_SECRET` and `APP_URL` are loaded from environment variables. `.env` is excluded by `.gitignore`. The application does not connect to databases from browser code; the browser calls the server API only.

## Operational boundary

This is an academic single-process prototype. A public deployment should additionally use HTTPS, managed secrets, strict CORS/origin policy if required, login/queue rate limits, a CSRF strategy appropriate for cookie auth, structured error monitoring, automated backups, schema migrations, a MongoDB outbox/retry worker, and a trusted match verification process.
