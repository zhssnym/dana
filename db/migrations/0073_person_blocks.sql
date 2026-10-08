-- A Person block stores only a member id. Current profile data is read at display time.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO definition
    FROM pg_constraint c
   WHERE c.conname = 'page_blocks_kind_check' AND c.conrelid = 'page_blocks'::regclass;
  IF definition IS NULL OR position('ARRAY[' IN definition) = 0 OR position('''person''' IN definition) > 0 THEN
    RAISE EXCEPTION '0073: unexpected kind constraint: %', definition;
  END IF;
  ALTER TABLE page_blocks DROP CONSTRAINT page_blocks_kind_check;
  EXECUTE format('ALTER TABLE page_blocks ADD CONSTRAINT page_blocks_kind_check %s',
    regexp_replace(definition, 'ARRAY\[', 'ARRAY[''person''::text, '));
END $$;
--> statement-breakpoint
ALTER TABLE page_blocks
  ADD CONSTRAINT page_blocks_person_content_check
    CHECK (kind <> 'person' OR
      (text IS NOT NULL AND text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND
       rich_content IS NULL AND file_id IS NULL AND ref_folder_id IS NULL AND
       width_pct IS NULL AND checked IS NULL AND toggleable IS NULL));
