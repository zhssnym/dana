ALTER TABLE direct_messages ADD COLUMN read_at timestamptz;
--> statement-breakpoint
UPDATE direct_messages SET read_at = now();
--> statement-breakpoint
CREATE INDEX direct_messages_unread_idx ON direct_messages (conversation_id, author_id) WHERE read_at IS NULL;
