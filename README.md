# ArenaRank — Competitive Esports Matchmaking & Elo Leaderboard Platform

**DBMS Experiential Learning — Level 3 | Department of Computer Science and Engineering**

ArenaRank is a full-stack academic prototype for fair, rating-aware esports matchmaking. It combines PostgreSQL for transactional competition records and Elo ratings, MongoDB for flexible match telemetry and activity/audit documents, and a Next.js web interface with player and administrator roles.

> **Academic hand-in note:** Replace the second team member placeholder in the report and contribution matrix, confirm the project title is unique within your section, run the application on your machine, capture your own screenshots, and update the test table with actual execution outcomes before final submission. Seeded accounts and fixture statistics are illustrative.

## 1. Feature summary

- Player registration and sign-in; passwords are hashed with bcrypt and sessions use HTTP-only signed cookies.
- Two roles: `PLAYER` and `ADMIN`. Registration can create only a player account; admin access is available only through the seeded local demo account.
- Per-game, per-season Elo ratings, peak rating, wins, losses, match count, win rate and ranked leaderboard.
- Matchmaking queue that pairs players only in the same game and active season, uses a configurable Elo window (±300 by default), picks the nearest rating first, and uses queue age as a tie-breaker.
- PostgreSQL transaction for queue join / match creation, plus a stored `finalize_match` function to update both ratings, match result and both rating-history entries atomically.
- MongoDB `audit_events` for activity history and `match_telemetry` for flexible game-specific metadata.
- Searchable leaderboard/player directory, recent matches and an admin console for finalizing pending match results.
- ER diagram, architecture diagram, relational schema, NoSQL data-model explanation, SQL demonstration queries, test cases, and submission report are in `docs/`.

## 2. Technology decisions

| Layer | Choice | Reason |
|---|---|---|
| Web interface | Next.js App Router, React, TypeScript | Required web framework; one interface for player and admin workflows |
| API | Next.js Route Handlers | Server-side authentication and database access without exposing credentials |
| Relational database | PostgreSQL 16 | Foreign keys, check constraints, transactions, stored function, trigger, views, ranking/window functions and indexes |
| NoSQL database | MongoDB 7 | Flexible documents for evolving telemetry and append-only activity events |
| Authentication | bcryptjs + signed JWT cookie via `jose` | Stored password hashes and HTTP-only session cookie for role checks |
| Local services | Docker Compose | Repeatable local PostgreSQL and MongoDB setup |

A vector database is intentionally **not** used. The core problem depends on numeric ratings, equality/range filters, relational integrity and ranking—not semantic similarity over unstructured text. MongoDB meets the SQL + NoSQL option in the project requirements.

## 3. Prerequisites

- Docker Desktop with Docker Compose enabled
- Node.js 20 or later and npm
- A terminal in this project directory

## 4. Run locally (Windows PowerShell)

```powershell
Copy-Item .env.example .env
# Open .env, replace SESSION_SECRET, and keep PostgreSQL/MongoDB credentials in the two connection URLs synchronized with POSTGRES_* and MONGO_ROOT_* values.
docker compose up -d
npm install
npm run seed
npm run dev
```

Open `http://localhost:3000`.

### Local demo accounts

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@esports.local` | `Admin123!` |
| Player | `player1@esports.local` | `Player123!` |
| Player | `player2@esports.local` | `Player123!` |
| Player | `player3@esports.local` | `Player123!` |

These credentials are for local academic demonstration only. They must not be reused in a public deployment.

### Linux / macOS equivalent

```bash
cp .env.example .env
# Edit .env; replace SESSION_SECRET and keep DB credentials synchronized with the connection URLs.
docker compose up -d
npm install
npm run seed
npm run dev
```

## 5. Database setup and reset

The `postgres` service mounts `db/schema.sql` into PostgreSQL's first-run initialization directory. PostgreSQL executes it only when the database volume is first initialized. The seed script adds demo users, games, the active season, ratings, sample results, MongoDB indexes, sample audit events and synthetic telemetry.

Re-run `npm run seed` to restore demo-account passwords and ensure seed records exist. The script creates fixture matches only when the SQL database contains no matches.

For a **disposable local development reset only**, this recreates the database from the schema:

```powershell
docker compose down -v
docker compose up -d
npm run seed
```

`down -v` permanently deletes the local database volumes. Do not use it for data you need to preserve.

To apply the schema manually to an already-initialized development database:

```powershell
docker compose exec -T postgres psql -U esports -d esports_platform < db/schema.sql
```

The `db/ddl_demo.sql` script shows `CREATE`, `ALTER`, index creation and `DROP` using a temporary table inside a transaction; it is safe for a viva demonstration and ends with `ROLLBACK`.

Useful database shells (these examples use the local defaults from `.env.example`):

```powershell
docker compose exec postgres psql -U esports -d esports_platform
docker compose exec mongodb mongosh --username root --password mongo_dev_only --authenticationDatabase admin esports_audit
```

The SQL examples in `docs/important_queries.sql` include named placeholders; replace each with a real ID or value before running the query in your SQL client.

## 6. Validation commands

```bash
npm run typecheck
npm run test:elo
npm run build
```

The Elo unit tests validate equal-rating wins, upset behavior, winner validation and rating bounds. The full end-to-end test plan is `docs/test_cases.md`; it includes UI/API/SQL/NoSQL cases and expected results. Mark the actual result only after running each case on the project machine.

## 7. Repository map

```text
app/                       Next.js UI and API route handlers
  api/auth/                 Register, login, logout, session check
  api/dashboard/            Stats, leaderboard, match list and admin activity feed
  api/queue/                Join/leave skill-based matchmaking
  api/matches/[id]/result/  Admin-only official result finalization
  api/players/              Searchable player directory
lib/                       PostgreSQL, MongoDB, session and Elo helpers
db/schema.sql              Relational DDL, constraints, indexes, triggers, view, Elo function
db/ddl_demo.sql             Safe CREATE / ALTER / DROP demonstration
scripts/seed.mjs             Reproducible local seed routine
tests/elo.test.mjs           Elo unit tests
docs/project_report.md       Complete report source
docs/erd.dot                 ER diagram source
docs/architecture.dot        Architecture diagram source
docs/important_queries.sql   Demo-ready SQL queries
docs/data_dictionary.md      Table and field descriptions
docs/nosql_design.md         MongoDB design and retrieval strategy
docs/system_architecture.md  Components and main data flows
docs/test_cases.md           Test plan and result fields
```

## 8. Database concepts to demonstrate

1. **Transactions:** queue join and pending-match creation; result finalization and rating history updates.
2. **View:** `leaderboard_view` ranks players per game and season using `RANK()`.
3. **Stored function:** `finalize_match(match_id, winner_id)` computes and applies Elo updates.
4. **Triggers:** `set_updated_at()`, `validate_match_participants()` and `prevent_rating_history_mutation()` maintain metadata, validate matches and protect append-only rating history.
5. **Indexes:** queue candidate index, match-history indexes, rating-history index and GIN full-text player-search index.
6. **Constraints:** primary/foreign keys, unique usernames/emails, check constraints, one active season, valid winner and rating bounds.
7. **Aggregations/window functions:** win-rate calculation, grouped performance and `RANK()`.
8. **NoSQL indexes/aggregation:** MongoDB indexes support actor/date and match-telemetry lookup; the admin view reads recent audit documents.

## 9. Security and limitations

- Database connection strings and the session-signing key come from `.env`; `.env` is git-ignored.
- Player registration cannot grant the `ADMIN` role. Admin result controls are server-side role-protected.
- Passwords are hashed; sessions are signed and stored in an HTTP-only cookie.
- The demonstration uses local-development database passwords, no email verification, and simplified match adjudication. Replace credentials, deploy with HTTPS, use a proper secret manager, add rate limiting/CSRF protections, operational backups and a trusted match-verification workflow before any public use.
- The Elo implementation is a simplified two-player, no-draw variant with K=32. It is intended for DBMS demonstration, not a production esports rating policy.
- Demo users, match outcomes, ratings and MongoDB telemetry are synthetic. Do not present them as real player performance.

## 10. Suggested live demonstration sequence

1. Explain the ER diagram and why PostgreSQL and MongoDB have different responsibilities.
2. Sign in as a player; show the dashboard, season rating, leaderboard and match history.
3. Join a game queue; demonstrate the queue row and matchmaking candidate query in PostgreSQL. Use a second player in a separate browser to produce a match.
4. Sign in as admin; finalize a pending match with a winner. Show the match row, changed player ratings, and two `rating_history` records.
5. Show the `leaderboard_view`, one aggregate query, constraints/indexes, and the `finalize_match` function / triggers.
6. Show MongoDB `audit_events` / `match_telemetry` and the admin activity panel.
7. Run `npm run test:elo`, execute `db/ddl_demo.sql`, and explain the test matrix and limitations.

## 11. Team contribution record

Fill in member names and SRNs before submission. Both members should make meaningful commits across database and application work; use the matrix in `docs/team_contributions.md` as the starting point, then change it to reflect actual work.
