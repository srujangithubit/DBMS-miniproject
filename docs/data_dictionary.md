# Data Dictionary and Relational Schema

## 1. Entity summary

| Table | Purpose | Primary key | Main relationships |
|---|---|---|---|
| `app_users` | Sign-in identity, role, account status | `id` UUID | One-to-one optional profile |
| `games` | Supported competitive titles | `id` smallint | Games have season stats, queues and matches |
| `seasons` | Time-bounded rating competitions | `id` UUID | One active season; stats and matches belong to a season |
| `player_profiles` | Player-facing profile metadata | `user_id` UUID | User identity; stats; queued entry; matches |
| `player_game_stats` | Rating and record per player/game/season | `(player_id, game_id, season_id)` | Player, game and season foreign keys |
| `matchmaking_queue` | Active queue entries | `id` UUID; `player_id` unique | Player, game and season |
| `matches` | Match participants and official result | `id` UUID | Game, season, two participants and optional winner |
| `rating_history` | Immutable rating movement per player and match | `id` bigserial | Player, match, game and season |

## 2. Field-level notes

### `app_users`
- `id`: generated UUID, primary key.
- `username`: unique handle; 3–24 alphanumeric/underscore characters.
- `email`: unique account email; a CHECK constraint rejects malformed basic email values.
- `password_hash`: bcrypt hash; never store plaintext passwords.
- `role`: `PLAYER` or `ADMIN`; public registration hard-codes `PLAYER`.
- `is_active`: enables account access to be disabled.
- `created_at`, `updated_at`: audit timestamps; update trigger refreshes `updated_at`.

### `games`
- `id`: generated small integer; `slug` and `name` are unique.
- `genre`: descriptive game category; `is_active` controls queue availability.

### `seasons`
- `id`: UUID; `name` unique.
- `starts_on`, `ends_on`: date boundary; a check constraint rejects reversed dates.
- `is_active`: partial unique index permits at most one active season.

### `player_profiles`
- `user_id`: primary key and foreign key to `app_users` with cascade-on-delete.
- `display_name`: 2–32 characters.
- `region`: player region label (default `APAC`).
- `bio`: optional short free-text description; included in full-text search.

### `player_game_stats`
- Composite key `(player_id, game_id, season_id)` ensures a distinct rating ladder for each title in each season.
- `rating`: current Elo, constrained to 100–4000; default 1000.
- `peak_rating`: best reached rating; cannot be below current rating.
- `games_played`, `wins`, `losses`: non-negative counters; `wins + losses = games_played`.
- `updated_at`: maintained by trigger.

### `matchmaking_queue`
- `player_id` is unique, allowing one active queue entry per player.
- `rating_snapshot` freezes the rating at queue entry for candidate sorting.
- `game_id`, `season_id`, and `joined_at` determine eligibility and FIFO tie-breaking.

### `matches`
- `player_a_id` and `player_b_id` must differ.
- `winner_id` is nullable before result finalization and must be a participant if present.
- Status values are `PENDING`, `COMPLETED`, and `CANCELLED`.
- A completed result must include winner, completion timestamp, and before/after ratings. Non-completed matches cannot have a winner/completion timestamp.
- Trigger `validate_match_participants` ensures both players have stats for the corresponding game and season.

### `rating_history`
- One row per player per finalized match, enforced by `UNIQUE(player_id, match_id)`.
- `old_rating`, `new_rating`, `delta` preserve the rating movement; check constraint enforces `new_rating - old_rating = delta`. An append-only trigger rejects UPDATE/DELETE, and restrictive foreign keys preserve match/player history.

## 3. Relational schema notation

- `APP_USERS(**id**, username UQ, email UQ, password_hash, role, is_active, created_at, updated_at)`
- `GAMES(**id**, slug UQ, name UQ, genre, is_active, created_at)`
- `SEASONS(**id**, name UQ, starts_on, ends_on, is_active, created_at)`
- `PLAYER_PROFILES(**user_id** FK→APP_USERS.id, display_name, region, bio, created_at, updated_at)`
- `PLAYER_GAME_STATS(**player_id** FK→PLAYER_PROFILES.user_id, **game_id** FK→GAMES.id, **season_id** FK→SEASONS.id, rating, peak_rating, games_played, wins, losses, updated_at)`; composite PK = `(player_id, game_id, season_id)`.
- `MATCHMAKING_QUEUE(**id**, player_id UQ FK→PLAYER_PROFILES.user_id, game_id FK→GAMES.id, season_id FK→SEASONS.id, rating_snapshot, joined_at)`
- `MATCHES(**id**, game_id FK→GAMES.id, season_id FK→SEASONS.id, player_a_id FK→PLAYER_PROFILES.user_id, player_b_id FK→PLAYER_PROFILES.user_id, winner_id FK→PLAYER_PROFILES.user_id NULL, status, rating snapshots, timestamps)`
- `RATING_HISTORY(**id**, player_id FK→PLAYER_PROFILES.user_id, match_id FK→MATCHES.id, game_id FK→GAMES.id, season_id FK→SEASONS.id, old_rating, new_rating, delta, created_at)`; unique `(player_id, match_id)`.

## 4. Integrity policy

Application checks improve usability; database constraints enforce correctness even if the API is bypassed. The stored function locks the match and both relevant rating rows before changing a completed result, and runs within the same transaction that commits the API operation. Rating history is inserted in the same function so no successful result update can omit one player's history record. The database rejects changes to existing history rows and prevents deletion of a referenced match or player profile.
