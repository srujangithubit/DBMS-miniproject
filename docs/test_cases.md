# Test Plan and Results Template

Run the cases on the project machine. The **Actual Result** column is intentionally left as `Not run` so the report does not claim tests were executed when they have not been. Replace it with Pass/Fail and evidence after testing.

| ID | Area | Test / action | Expected result | Actual result |
|---|---|---|---|---|
| TC-01 | Auth | Sign in with `player1@esports.local` / `Player123!` | HTTP 200; player dashboard loads; HTTP-only session cookie set | Not run |
| TC-02 | Auth | Sign in with wrong password | HTTP 401; no authenticated session created | Not run |
| TC-03 | Auth | Register with valid unique handle, email, display name, password | HTTP 201; role is `PLAYER`; profile and active season/game stats exist | Not run |
| TC-04 | Auth / validation | Register with invalid email, short handle, or password shorter than 8 characters | HTTP 400 with validation message; no user created | Not run |
| TC-05 | Authorization | Player posts to `/api/matches/{id}/result` | HTTP 403; no match or rating data changed | Not run |
| TC-06 | Queue | Player joins the queue with valid active game | One queue entry created with rating snapshot | Not run |
| TC-07 | Queue | Same player joins same game queue again | `ALREADY_QUEUED`; no duplicate queue row | Not run |
| TC-08 | Queue | A second compatible player joins same game/season within ±300 Elo | Pending match created; both queue entries deleted in one transaction | Not run |
| TC-09 | Queue | Candidate player is outside rating window | No match formed; entrant remains queued | Not run |
| TC-10 | Queue | Player leaves a queue | Player's queue row is deleted; other queue rows unaffected | Not run |
| TC-11 | Match result | Admin finalizes a pending match with participant A as winner | Status completed; winner saved; ratings/counters/history updated | Not run |
| TC-12 | Integrity | Admin attempts to set a winner that is not a participant | Request fails; match and ratings remain unchanged | Not run |
| TC-13 | Idempotency/integrity | Admin finalizes same match twice | Second attempt rejected; no duplicate rating-history rows | Not run |
| TC-14 | Leaderboard | Complete a match and refresh leaderboard | Rankings and win rate reflect committed result | Not run |
| TC-15 | SQL features | Execute `db/ddl_demo.sql` | Temporary table is created, altered, indexed, dropped; transaction rolled back | Not run |
| TC-16 | SQL features | Query `leaderboard_view` for a game and active season | Correct per-game/per-season rank order | Not run |
| TC-17 | NoSQL | Sign in, join queue or finalize result, then inspect `audit_events` | An action event appears with actor, action, entity, timestamp | Not run |
| TC-18 | NoSQL | Inspect `match_telemetry` for a seeded fixture | Document includes flexible game-specific metrics and seed-demo marker | Not run |
| TC-19 | Indexes/search | Search for a profile by display name or bio text | Matching player is returned; GIN full-text index is available to planner where appropriate | Not run |
| TC-20 | Automated unit test | Run `npm run test:elo` | All Elo helper tests pass | Pass — 4 tests passed |
| TC-21 | Build | Run `npm run typecheck` and `npm run build` | TypeScript/build completes without errors | Pass — typecheck and production build completed |
| TC-22 | Audit integrity | Attempt UPDATE or DELETE on an existing `rating_history` row in a disposable test DB | Trigger rejects the mutation; original history row remains unchanged | Not run |

## Evidence checklist

- [ ] Screenshot of sign-in form and successful player dashboard.
- [ ] Screenshot of leaderboard and the game/season selector.
- [ ] Screenshot showing queue status and a generated pending match.
- [ ] Screenshot of admin finalization and success message.
- [ ] PostgreSQL output showing both `rating_history` rows and updated `player_game_stats` after finalization.
- [ ] PostgreSQL output from `leaderboard_view` and `db/ddl_demo.sql`.
- [ ] MongoDB output from `audit_events` and `match_telemetry`.
- [ ] Terminal output for `npm run test:elo`, `npm run typecheck` and `npm run build`.

## Notes for repeatable tests

Use the seeded local accounts. To exercise real pairing, sign in as `player1` in one browser profile and another player in a separate browser/incognito profile, then join the same game. Admin can finalize pending matches from the Admin console. Record the match UUID and check the corresponding rows using the queries in `docs/important_queries.sql`.

## Automated suite added for the submission

The repository's automated test command now covers the Elo helper, MongoDB aggregation pipeline definitions and database integration scenarios.

~~~bash
npm test
~~~

The fast suite consists of 12 Elo unit tests and 3 MongoDB pipeline-builder unit tests. The PostgreSQL and MongoDB integration tests are opt-in and are skipped unless `TEST_DATABASE_URL` and `TEST_MONGODB_URI` are configured. A skipped integration test is **not** a passed test.

| ID | Automated area | Scenario | Expected result | Execution status |
|---|---|---|---|---|
| AT-01 to AT-12 | Elo unit tests | Equal-rating wins for either player; upset/favorite behavior; invalid winner; integer and range validation; clamping; zero-sum movement; player-order symmetry; configurable K-factor and invalid K-factor | All assertions pass | 12 tests passed in the implementation check on 16 Nov 2026 |
| AT-13 | MongoDB pipeline unit test | Activity pipeline contains the date match, action grouping, unique-actor projection and sort/limit stages | Pipeline structure is valid | Passed in the implementation check on 16 Nov 2026 |
| AT-14 | MongoDB pipeline unit test | Game and map telemetry pipelines group and average the expected fields | Pipeline structure is valid | Passed in the implementation check on 16 Nov 2026 |
| AT-15 | MongoDB pipeline unit test | Invalid dates and empty game filters are rejected | Validation throws the expected errors | Passed in the implementation check on 16 Nov 2026 |
| IT-PG-01 | PostgreSQL integration | Finalize a pending fixture match | Both ratings/counters update, match becomes completed, and exactly two history rows are inserted | Not run here; requires `TEST_DATABASE_URL` and the project schema |
| IT-PG-02 | PostgreSQL integration | Finalize with a non-participant as winner | Function rejects the winner; transaction can roll back to savepoint; match/rating/history remain unchanged | Not run here; requires `TEST_DATABASE_URL` and the project schema |
| IT-PG-03 | PostgreSQL integration | Finalize the same match twice | Second finalization is rejected; no second rating increment or history pair appears | Not run here; requires `TEST_DATABASE_URL` and the project schema |
| IT-PG-04 | PostgreSQL integration | Update an existing rating-history row | Append-only trigger rejects the mutation and both history rows remain | Not run here; requires `TEST_DATABASE_URL` and the project schema |
| IT-MG-01 | MongoDB integration | Aggregate temporary activity documents | Correct action counts, latest timestamp and unique actor count are returned | Not run here; requires `TEST_MONGODB_URI` |
| IT-MG-02 | MongoDB integration | Aggregate temporary telemetry documents | Correct per-game averages and selected-game map totals | Not run here; requires `TEST_MONGODB_URI` |

### Isolated integration-test database setup

Never point integration tests at your normal development or production database. The tests refuse PostgreSQL or MongoDB database names that do not end in `_test`, create uniquely named fixture records/collections, and roll back or drop those fixtures.

For PostgreSQL, create a separate database and apply the schema. On the default Docker Compose setup, the service is reachable from the host on port `5433`:

~~~bash
docker compose exec postgres createdb -U esports esports_platform_test
psql "postgresql://esports:change-me-locally@localhost:5433/esports_platform_test" -v ON_ERROR_STOP=1 -f db/schema.sql
~~~

Set the following values in `.env` before running the integration suite:

~~~env
TEST_DATABASE_URL=postgresql://esports:change-me-locally@localhost:5433/esports_platform_test
TEST_MONGODB_URI=mongodb://root:change-me-locally@localhost:27017/esports_audit_test?authSource=admin
~~~

The MongoDB integration suite creates temporary uniquely named collections in `esports_audit_test` and drops them after each test. It does not clear existing collections.

Run the complete suite with `npm test`, or just the database tests with `npm run test:integration`. When the two test connection variables are blank, the database tests are reported as skipped. The CI workflow provisions disposable PostgreSQL and MongoDB services and runs all six database integration cases.

## Build verification

Run these separately and record the actual output from the project machine:

~~~bash
npm run typecheck
npm run build
~~~

The implementation environment used for the 15 fast unit tests did not have the repository's PostgreSQL/MongoDB services or complete installed project dependencies. Therefore, those database integration tests, the full Next.js build, and the screenshot checklist remain pending until executed in the project environment or the repository's CI workflow.
