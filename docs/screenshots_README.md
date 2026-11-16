# Screenshots to capture before submission

Screenshots must come from your own running instance. This folder does not contain fabricated application evidence.

Recommended filenames:
1. `01_login.png` — sign-in screen and demo account choice.
2. `02_player_dashboard.png` — current player rating, KPIs and leaderboard.
3. `03_leaderboard_search.png` — player search result.
4. `04_queue_joined.png` — matchmaking queue state.
5. `05_match_created.png` — match produced from two browser profiles.
6. `06_admin_pending_match.png` — pending match in admin console.
7. `07_result_finalized.png` — admin finalization success and updated ratings.
8. `08_postgres_rating_history.png` — SQL output with two history rows and changed rating rows.
9. `09_mongodb_audit_events.png` — audit documents and telemetry in MongoDB.
10. `10_test_output.png` — actual `npm run test:elo` / `npm run typecheck` / `npm run build` output.

Put the images in this folder and insert them into the report appendix. Update the test matrix with the real result for each case. Do not label a planned test as passed without actually running it.

Additional screenshots for the extended DBMS evidence:

11. `11_mongodb_aggregation.png` — output of `npm run demo:mongodb` showing all three live aggregations.
12. `12_database_integration_tests.png` — PostgreSQL and MongoDB integration test output with isolated test databases configured.
13. `13_full_test_build_output.png` — `npm test`, `npm run typecheck` and `npm run build` output from the final checkout.

Capture these from an actual running project instance. Do not create placeholder screenshots or treat skipped database tests as passed.
