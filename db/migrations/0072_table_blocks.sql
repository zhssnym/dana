-- A Table keeps its cells in rich_content. Existing rich text stays unchanged.
DO $$
DECLARE target text; definition text;
BEGIN
  FOREACH target IN ARRAY ARRAY['page_blocks_kind_check', 'page_blocks_rich_content_check'] LOOP
    SELECT pg_get_constraintdef(c.oid) INTO definition
      FROM pg_constraint c
     WHERE c.conname = target AND c.conrelid = 'page_blocks'::regclass;
    IF definition IS NULL OR position('ARRAY[' IN definition) = 0 THEN
      RAISE EXCEPTION '0072: unexpected constraint %: %', target, definition;
    END IF;
    IF position('''table''' IN definition) = 0 THEN
      EXECUTE format('ALTER TABLE page_blocks DROP CONSTRAINT %I', target);
      EXECUTE format('ALTER TABLE page_blocks ADD CONSTRAINT %I %s', target,
        regexp_replace(definition, 'ARRAY\[', 'ARRAY[''table''::text, '));
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE page_blocks
  ADD CONSTRAINT page_blocks_table_content_check
    CHECK (kind <> 'table' OR
      (rich_content IS NOT NULL AND rich_content ? 'table' AND
       char_length(text) <= 4000 AND file_id IS NULL AND ref_folder_id IS NULL AND
       width_pct IS NULL AND checked IS NULL AND toggleable IS NULL));
