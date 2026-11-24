
ALTER TABLE registrations
ADD COLUMN created_at TEXT;

UPDATE registrations
SET created_at = CURRENT_TIMESTAMP
WHERE created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_event
ON registrations(event_id);
