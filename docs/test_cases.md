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
| TC-20 | Automated unit test | Run `npm run test:elo` | All Elo helper tests pass | Not run |
| TC-21 | Build | Run `npm run typecheck` and `npm run build` | TypeScript/build completes without errors | Not run |
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
