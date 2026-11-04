-- Competitive Esports Matchmaking & Elo Leaderboard Platform
-- PostgreSQL schema. Safe to run on a fresh database; CREATE statements are idempotent.

CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(24) NOT NULL UNIQUE,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('PLAYER', 'ADMIN')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_username_format CHECK (username ~ '^[A-Za-z0-9_]{3,24}$'),
    CONSTRAINT ck_email_format CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

CREATE TABLE IF NOT EXISTS games (
    id SMALLSERIAL PRIMARY KEY,
    slug VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL UNIQUE,
    genre VARCHAR(40) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(80) NOT NULL UNIQUE,
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_season_dates CHECK (ends_on >= starts_on)
);

-- Only one season may be active at once. Ratings are maintained per player, game, and season.
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_season
    ON seasons ((is_active)) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS player_profiles (
    user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    display_name VARCHAR(32) NOT NULL,
    region VARCHAR(40) NOT NULL DEFAULT 'APAC',
    bio VARCHAR(280) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_display_name_length CHECK (char_length(display_name) BETWEEN 2 AND 32)
);

CREATE TABLE IF NOT EXISTS player_game_stats (
    player_id UUID NOT NULL REFERENCES player_profiles(user_id) ON DELETE CASCADE,
    game_id SMALLINT NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
    rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating BETWEEN 100 AND 4000),
    peak_rating INTEGER NOT NULL DEFAULT 1000 CHECK (peak_rating BETWEEN 100 AND 4000),
    games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
    wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
    losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (player_id, game_id, season_id),
    CONSTRAINT ck_record_consistency CHECK (wins + losses = games_played),
    CONSTRAINT ck_peak_not_below_rating CHECK (peak_rating >= rating)
);

CREATE TABLE IF NOT EXISTS matchmaking_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL UNIQUE REFERENCES player_profiles(user_id) ON DELETE CASCADE,
    game_id SMALLINT NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
    rating_snapshot INTEGER NOT NULL CHECK (rating_snapshot BETWEEN 100 AND 4000),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id SMALLINT NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
    player_a_id UUID NOT NULL REFERENCES player_profiles(user_id) ON DELETE RESTRICT,
    player_b_id UUID NOT NULL REFERENCES player_profiles(user_id) ON DELETE RESTRICT,
    winner_id UUID REFERENCES player_profiles(user_id) ON DELETE RESTRICT,
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
    player_a_rating_before INTEGER,
    player_b_rating_before INTEGER,
    player_a_rating_after INTEGER,
    player_b_rating_after INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT ck_distinct_match_players CHECK (player_a_id <> player_b_id),
    CONSTRAINT ck_winner_is_participant CHECK (winner_id IS NULL OR winner_id IN (player_a_id, player_b_id)),
    CONSTRAINT ck_match_completion_fields CHECK (
      (status = 'COMPLETED' AND winner_id IS NOT NULL AND completed_at IS NOT NULL
       AND player_a_rating_before IS NOT NULL AND player_b_rating_before IS NOT NULL
       AND player_a_rating_after IS NOT NULL AND player_b_rating_after IS NOT NULL)
      OR
      (status <> 'COMPLETED' AND winner_id IS NULL AND completed_at IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS rating_history (
    id BIGSERIAL PRIMARY KEY,
    player_id UUID NOT NULL REFERENCES player_profiles(user_id) ON DELETE RESTRICT,
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE RESTRICT,
    game_id SMALLINT NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
    old_rating INTEGER NOT NULL CHECK (old_rating BETWEEN 100 AND 4000),
    new_rating INTEGER NOT NULL CHECK (new_rating BETWEEN 100 AND 4000),
    delta INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rating_history_player_match UNIQUE (player_id, match_id),
    CONSTRAINT ck_rating_delta CHECK (new_rating - old_rating = delta)
);

-- Upgrade safely if the schema was previously initialized with cascading history FKs.
ALTER TABLE rating_history DROP CONSTRAINT IF EXISTS rating_history_player_id_fkey;
ALTER TABLE rating_history ADD CONSTRAINT rating_history_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES player_profiles(user_id) ON DELETE RESTRICT;
ALTER TABLE rating_history DROP CONSTRAINT IF EXISTS rating_history_match_id_fkey;
ALTER TABLE rating_history ADD CONSTRAINT rating_history_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE RESTRICT;

-- Audit/event documents and flexible match telemetry live in MongoDB (see docs/nosql_design.md).

-- Indexes supporting matchmaking, leaderboard, player history, and search.
CREATE INDEX IF NOT EXISTS idx_queue_match_candidates
    ON matchmaking_queue (game_id, season_id, rating_snapshot, joined_at);
CREATE INDEX IF NOT EXISTS idx_matches_player_a_recent
    ON matches (player_a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_player_b_recent
    ON matches (player_b_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_game_status_recent
    ON matches (game_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rating_history_player_recent
    ON rating_history (player_id, game_id, season_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_profiles_search
    ON player_profiles USING GIN (to_tsvector('english', display_name || ' ' || COALESCE(bio, '')));

-- Trigger 1: maintain updated_at consistently.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON app_users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON app_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON player_profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON player_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_game_stats_updated_at ON player_game_stats;
CREATE TRIGGER trg_game_stats_updated_at BEFORE UPDATE ON player_game_stats
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger 3: rating history is append-only to preserve the audit trail.
CREATE OR REPLACE FUNCTION prevent_rating_history_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rating_history is append-only; UPDATE and DELETE are not permitted';
END;
$$;
DROP TRIGGER IF EXISTS trg_rating_history_append_only ON rating_history;
CREATE TRIGGER trg_rating_history_append_only BEFORE UPDATE OR DELETE ON rating_history
FOR EACH ROW EXECUTE FUNCTION prevent_rating_history_mutation();

-- Trigger 2: prevent a match from referencing players without a stats row for that game and season.
CREATE OR REPLACE FUNCTION validate_match_participants()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.player_a_id = NEW.player_b_id THEN
    RAISE EXCEPTION 'A player cannot be matched against themselves';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM player_game_stats s
    WHERE s.player_id = NEW.player_a_id AND s.game_id = NEW.game_id AND s.season_id = NEW.season_id
  ) THEN
    RAISE EXCEPTION 'Player A has no rating record for this game and season';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM player_game_stats s
    WHERE s.player_id = NEW.player_b_id AND s.game_id = NEW.game_id AND s.season_id = NEW.season_id
  ) THEN
    RAISE EXCEPTION 'Player B has no rating record for this game and season';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_match_participants_valid ON matches;
CREATE TRIGGER trg_match_participants_valid BEFORE INSERT OR UPDATE ON matches
FOR EACH ROW EXECUTE FUNCTION validate_match_participants();

-- Advanced SQL feature: analytical view with a per-game, per-season rank.
CREATE OR REPLACE VIEW leaderboard_view AS
SELECT
  s.player_id AS user_id,
  u.username,
  p.display_name,
  p.region,
  s.game_id,
  g.name AS game_name,
  s.season_id,
  se.name AS season_name,
  s.rating,
  s.peak_rating,
  s.games_played,
  s.wins,
  s.losses,
  ROUND(100.0 * s.wins / NULLIF(s.games_played, 0), 1) AS win_rate_pct,
  RANK() OVER (
    PARTITION BY s.game_id, s.season_id
    ORDER BY s.rating DESC, s.wins DESC, p.display_name ASC
  ) AS rank_position
FROM player_game_stats s
JOIN app_users u ON u.id = s.player_id AND u.is_active = TRUE
JOIN player_profiles p ON p.user_id = s.player_id
JOIN games g ON g.id = s.game_id
JOIN seasons se ON se.id = s.season_id;

-- Advanced SQL feature: atomic Elo update. Called inside the API's transaction.
CREATE OR REPLACE FUNCTION finalize_match(p_match_id UUID, p_winner_id UUID)
RETURNS TABLE (
  finalized_match_id UUID,
  finalized_winner_id UUID,
  player_a_new_rating INTEGER,
  player_b_new_rating INTEGER,
  player_a_delta INTEGER,
  player_b_delta INTEGER
)
LANGUAGE plpgsql AS $$
DECLARE
  m matches%ROWTYPE;
  rating_a INTEGER;
  rating_b INTEGER;
  expected_a NUMERIC;
  expected_b NUMERIC;
  score_a NUMERIC;
  new_a INTEGER;
  new_b INTEGER;
  k_factor CONSTANT INTEGER := 32;
BEGIN
  SELECT * INTO m FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % does not exist', p_match_id;
  END IF;
  IF m.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Only PENDING matches can be finalized';
  END IF;
  IF p_winner_id IS NULL OR p_winner_id NOT IN (m.player_a_id, m.player_b_id) THEN
    RAISE EXCEPTION 'Winner must be one of the two match participants';
  END IF;

  -- Stable lock ordering reduces the risk of concurrent match-finalization deadlocks.
  PERFORM 1 FROM player_game_stats
    WHERE game_id = m.game_id AND season_id = m.season_id
      AND player_id IN (m.player_a_id, m.player_b_id)
    ORDER BY player_id FOR UPDATE;

  SELECT rating INTO rating_a FROM player_game_stats
    WHERE player_id = m.player_a_id AND game_id = m.game_id AND season_id = m.season_id;
  SELECT rating INTO rating_b FROM player_game_stats
    WHERE player_id = m.player_b_id AND game_id = m.game_id AND season_id = m.season_id;
  IF rating_a IS NULL OR rating_b IS NULL THEN
    RAISE EXCEPTION 'Rating record is missing for a match participant';
  END IF;

  expected_a := 1.0 / (1.0 + POWER(10.0, (rating_b - rating_a)::NUMERIC / 400.0));
  expected_b := 1.0 - expected_a;
  score_a := CASE WHEN p_winner_id = m.player_a_id THEN 1.0 ELSE 0.0 END;
  new_a := GREATEST(100, LEAST(4000, ROUND(rating_a + k_factor * (score_a - expected_a))::INTEGER));
  new_b := GREATEST(100, LEAST(4000, ROUND(rating_b + k_factor * ((1.0 - score_a) - expected_b))::INTEGER));

  UPDATE player_game_stats
  SET rating = new_a,
      peak_rating = GREATEST(peak_rating, new_a),
      games_played = games_played + 1,
      wins = wins + CASE WHEN player_id = p_winner_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN player_id <> p_winner_id THEN 1 ELSE 0 END
  WHERE player_id = m.player_a_id AND game_id = m.game_id AND season_id = m.season_id;

  UPDATE player_game_stats
  SET rating = new_b,
      peak_rating = GREATEST(peak_rating, new_b),
      games_played = games_played + 1,
      wins = wins + CASE WHEN player_id = p_winner_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN player_id <> p_winner_id THEN 1 ELSE 0 END
  WHERE player_id = m.player_b_id AND game_id = m.game_id AND season_id = m.season_id;

  INSERT INTO rating_history (player_id, match_id, game_id, season_id, old_rating, new_rating, delta)
  VALUES
    (m.player_a_id, m.id, m.game_id, m.season_id, rating_a, new_a, new_a - rating_a),
    (m.player_b_id, m.id, m.game_id, m.season_id, rating_b, new_b, new_b - rating_b);

  UPDATE matches
  SET winner_id = p_winner_id,
      status = 'COMPLETED',
      player_a_rating_before = rating_a,
      player_b_rating_before = rating_b,
      player_a_rating_after = new_a,
      player_b_rating_after = new_b,
      completed_at = NOW()
  WHERE id = m.id;

  RETURN QUERY SELECT m.id, p_winner_id, new_a, new_b, new_a - rating_a, new_b - rating_b;
END;
$$;

COMMIT;
