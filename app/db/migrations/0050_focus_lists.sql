-- 0050: the viewer's Focus lists (round 8, focus).
--
-- The sidebar's Focus heading holds cross-project lists: Today, Upcoming and
-- Assigned by default, plus any the viewer adds from its "+" (Important,
-- Overdue, No date, All open). One ordered array of list keys per account; a
-- key missing from it is a hidden list, and the "+" offers it back. The
-- client drops keys it does not know, so the column stays a plain array.
--
-- Forward only; existing rows take the default, which is today's sidebar.
ALTER TABLE user_settings
  ADD COLUMN focus_lists jsonb NOT NULL DEFAULT '["today","scheduled","assignments"]'::jsonb,
  ADD CONSTRAINT user_settings_focus_lists_array_check CHECK (jsonb_typeof(focus_lists) = 'array');
