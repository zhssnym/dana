-- 0058: durable Focus identity (#353).
--
-- 1. `user_settings.focus_appearance` is the viewer's sparse map of Focus
--    icon/colour overrides. An absent key means the native Dana identity.
--    The shared request contract validates its nested values; JSONB keeps the
--    account-level map compact and lets future Focus keys use the same store.
-- 2. `overdue` joins the native place-cover alphabet. Place descriptions
--    intentionally import that same shared alphabet, so its database CHECK is
--    widened in the same migration rather than leaving the API able to accept
--    a key the table refuses.
--
-- Existing rows take the empty map. Existing cover/description rows already
-- satisfy the widened checks. Forward only.
ALTER TABLE user_settings
  ADD COLUMN focus_appearance jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE user_page_covers
  DROP CONSTRAINT user_page_covers_place_check,
  ADD CONSTRAINT user_page_covers_place_check
    CHECK (place IN (
      'today', 'scheduled', 'assignments', 'important', 'overdue',
      'all', 'done', 'abandoned', 'anytime'
    ));
--> statement-breakpoint
ALTER TABLE user_page_descriptions
  DROP CONSTRAINT user_page_descriptions_place_check,
  ADD CONSTRAINT user_page_descriptions_place_check
    CHECK (place IN (
      'today', 'scheduled', 'assignments', 'important', 'overdue',
      'all', 'done', 'abandoned', 'anytime'
    ));
