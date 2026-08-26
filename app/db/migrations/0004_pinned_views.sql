-- S7's half of RFC 0005's settings expansion: the pin list (BUG-8).
--
-- One nullable column and no data migration, by the S7 change-control
-- ruling: null means "never chosen", and the read derives the pins from
-- the three v1 flags that remain the record until the person first writes
-- pins, after which the column is the record and the flags derive for the
-- frozen 7.2 surface. At no moment are two records authoritative at once,
-- which is the sentence "two records of one fact are not kept" enforced by
-- derivation rather than by a drop the live v1 surface could not survive.
ALTER TABLE user_settings
  ADD COLUMN pinned_views jsonb,
  ADD CONSTRAINT user_settings_pinned_views_array_check CHECK (pinned_views IS NULL OR jsonb_typeof(pinned_views) = 'array');
