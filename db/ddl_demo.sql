-- Safe demonstration of CREATE, ALTER, INDEX, and DROP for the lab viva.
-- The object is a TEMP table and the entire script is rolled back at the end.
BEGIN;
CREATE TEMP TABLE ddl_feature_demo (
  demo_id BIGINT PRIMARY KEY,
  note TEXT NOT NULL
);
ALTER TABLE ddl_feature_demo ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX idx_ddl_feature_demo_note ON ddl_feature_demo(note);
INSERT INTO ddl_feature_demo (demo_id, note) VALUES (1, 'temporary DDL demonstration');
SELECT * FROM ddl_feature_demo;
DROP TABLE ddl_feature_demo;
ROLLBACK;
