-- Keep the beta feedback reminder dismissed for the account on every device.
ALTER TABLE user_settings
  ADD COLUMN feedback_reminder_dismissed boolean NOT NULL DEFAULT false;
