-- Keep the account's acknowledged public update IDs across devices.
-- An empty array means no newly released announcements have been acknowledged.
ALTER TABLE user_settings
  ADD COLUMN updates_seen_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT user_settings_updates_seen_ids_array_check
    CHECK (jsonb_typeof(updates_seen_ids) = 'array' AND octet_length(updates_seen_ids::text) <= 12000);
