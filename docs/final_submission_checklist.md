# Final DBMS Level 3 Submission Checklist

Use this checklist on the final checkout. Mark an item only after verifying it.

## Repository and setup
- [ ] Confirm the project title is unique within the section.
- [ ] Verify both student names and SRNs in the report.
- [ ] Ensure the contribution matrix reflects actual work and individual Git history.
- [ ] Clone the final branch on a clean machine and follow the README.
- [ ] Confirm .env is local-only and no real credentials are committed.

## Database and application verification
- [ ] Start PostgreSQL and MongoDB with Docker Compose.
- [ ] Apply the schema to a fresh database and run the seed script.
- [ ] Verify player/admin login and role restrictions.
- [ ] Run a two-player matchmaking flow and finalize a pending match.
- [ ] Show both updated player statistics and exactly two rating-history records.
- [ ] Run npm run demo:mongodb and explain the three aggregation outputs.
- [ ] Run the mongosh examples in docs/nosql_examples.js.
- [ ] Run PostgreSQL and MongoDB integration tests using isolated databases ending in _test.
- [ ] Run npm test, npm run typecheck and npm run build; retain terminal output.

## Documentation and evidence
- [ ] Confirm ER and architecture diagrams match the source.
- [ ] Confirm the data dictionary and SQL examples match the final schema.
- [ ] Update manual test outcomes with actual results and evidence.
- [ ] Never label skipped integration tests as passed.
- [ ] Capture current login, dashboard, leaderboard, queue, match, admin and database evidence.
- [ ] Capture MongoDB aggregation output as docs/assets/11_mongodb_aggregation.png.
- [ ] Capture integration-test output as docs/assets/12_database_integration_tests.png.
- [ ] Capture final test/typecheck/build output as docs/assets/13_full_test_build_output.png.
- [ ] Add current screenshots to the report appendix.
- [ ] Label seeded match results and telemetry as synthetic demonstration data.

## Test status policy
The implementation check on 16 November 2026 ran 15 fast JavaScript tests successfully (12 Elo tests and 3 aggregation-pipeline tests). Four PostgreSQL and two MongoDB integration tests require the isolated test databases and must be run on the project machine or in CI. Typecheck, production build and current application screenshots also require final project-environment verification. Do not replace pending evidence with assumed Pass results.
