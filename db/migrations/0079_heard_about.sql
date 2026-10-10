ALTER TABLE users ADD COLUMN heard_about text;
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_heard_about_length_check
  CHECK (char_length(heard_about) <= 40);
