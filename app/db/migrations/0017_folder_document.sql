ALTER TABLE page_blocks ADD COLUMN rich_content jsonb,
 DROP CONSTRAINT page_blocks_section_membership_check,
 ADD CONSTRAINT page_blocks_section_membership_check CHECK (section_block_id IS NULL OR folder_id IS NOT NULL),
 DROP CONSTRAINT page_blocks_text_length_check,
 ADD CONSTRAINT page_blocks_text_length_check CHECK ((kind <> 'section' OR char_length(text) BETWEEN 0 AND 120) AND (kind <> 'paragraph' OR char_length(text) <= 4000)),
 ADD CONSTRAINT page_blocks_rich_content_check CHECK (rich_content IS NULL OR (kind IN ('section','paragraph') AND octet_length(rich_content::text) <= 65536 AND rich_content->>'version' = '1'));
--> statement-breakpoint
CREATE TABLE page_document_receipts (
 actor_id uuid NOT NULL,
 folder_id uuid NOT NULL,
 mutation_id uuid NOT NULL,
 payload_hash text NOT NULL,
 committed_revision text NOT NULL,
 created_task_ids jsonb NOT NULL,
 CONSTRAINT page_document_receipts_pkey PRIMARY KEY (actor_id,folder_id,mutation_id),
 CONSTRAINT page_document_receipts_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT page_document_receipts_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
