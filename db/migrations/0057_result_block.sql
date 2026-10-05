-- 0057: the native Result (#213, M1 unit workmodel).
--
-- A Result is a block of kind 'result' in a Folder's Results facet: a stable
-- identity (the block id) and an authored statement (its rich text), with no
-- task fields at all. It is a Dana Link target, /app/results/:id.
--
-- 1. page_blocks_kind_check and page_blocks_rich_content_check gain 'result'
--    **in place, from whatever list the database holds now**. Other M1 units
--    widen the same two lists in lower-numbered migrations; rewriting the
--    list by hand here would silently drop their kinds, so this reads the
--    current definition and prepends one element to its only ARRAY. Same
--    names, same columns: the constraint catalog does not move.
-- 2. page_blocks_result_home_check (new): a Result lives only in a facet
--    document (which facet kind is the applier's to check, since a CHECK
--    cannot read folder_facets), and holds at most 4000 characters, the
--    paragraph limit, because text_length_check does not list it.
--
-- Existing rows: none has kind 'result', so every CHECK holds. Forward only.
DO $$
DECLARE
  target text;
  def text;
BEGIN
  FOREACH target IN ARRAY ARRAY['page_blocks_kind_check', 'page_blocks_rich_content_check'] LOOP
    SELECT pg_get_constraintdef(c.oid) INTO def
      FROM pg_constraint c
     WHERE c.conname = target AND c.conrelid = 'page_blocks'::regclass;
    IF def IS NULL OR position('ARRAY[' IN def) = 0 THEN
      RAISE EXCEPTION '0057: % is not the list it expected: %', target, def;
    END IF;
    IF position('''result''' IN def) = 0 THEN
      EXECUTE format('ALTER TABLE page_blocks DROP CONSTRAINT %I', target);
      EXECUTE format('ALTER TABLE page_blocks ADD CONSTRAINT %I %s', target,
        regexp_replace(def, 'ARRAY\[', 'ARRAY[''result''::text, '));
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE page_blocks
  ADD CONSTRAINT page_blocks_result_home_check
    CHECK (kind <> 'result' OR (facet_id IS NOT NULL AND char_length(text) <= 4000));
