ALTER TABLE users ADD COLUMN bio text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN bio_content jsonb;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN bio_updated_at timestamptz;
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_bio_length_check
  CHECK (bio IS NULL OR char_length(bio) <= 500);
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_bio_content_requires_bio_check
  CHECK (bio_content IS NULL OR bio IS NOT NULL);
