ALTER TABLE folder_members ADD COLUMN bio text;
--> statement-breakpoint
ALTER TABLE folder_members ADD CONSTRAINT folder_members_bio_length_check
  CHECK (bio IS NULL OR char_length(bio) <= 500);
