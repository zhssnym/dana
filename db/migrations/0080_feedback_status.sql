ALTER TABLE feedback ADD COLUMN status text DEFAULT 'new' NOT NULL;
--> statement-breakpoint
UPDATE feedback SET status = 'done' WHERE done_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE feedback DROP COLUMN done_at;
--> statement-breakpoint
ALTER TABLE feedback ADD CONSTRAINT feedback_status_check
  CHECK (status IN ('new', 'doing', 'done', 'wont'));
