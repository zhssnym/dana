-- #720: A synced block shows one source block live in another document.
-- It stores only the source block id in `text`, like a Person block stores a
-- member id. The source document stays the only writer of the content.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO definition
    FROM pg_constraint c
   WHERE c.conname = 'page_blocks_kind_check' AND c.conrelid = 'page_blocks'::regclass;
  IF definition IS NULL OR position('ARRAY[' IN definition) = 0 OR position('''synced''' IN definition) > 0 THEN
    RAISE EXCEPTION '0097: unexpected kind constraint: %', definition;
  END IF;
  ALTER TABLE page_blocks DROP CONSTRAINT page_blocks_kind_check;
  EXECUTE format('ALTER TABLE page_blocks ADD CONSTRAINT page_blocks_kind_check %s',
    regexp_replace(definition, 'ARRAY\[', 'ARRAY[''synced''::text, '));
END $$;
--> statement-breakpoint
ALTER TABLE page_blocks
  ADD CONSTRAINT page_blocks_synced_content_check
    CHECK (kind <> 'synced' OR
      (text IS NOT NULL AND text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND
       rich_content IS NULL AND file_id IS NULL AND ref_folder_id IS NULL AND
       width_pct IS NULL AND checked IS NULL AND toggleable IS NULL));
--> statement-breakpoint
CREATE INDEX page_blocks_synced_source_idx ON page_blocks (text) WHERE kind = 'synced';
--> statement-breakpoint
-- Every delete path (document save, Trash purge, Task delete) passes here.
-- Each copy keeps the last content of its source, so a delete loses no text.
CREATE FUNCTION page_blocks_unsync_copies() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  UPDATE page_blocks c
     SET kind = OLD.kind, text = OLD.text, rich_content = OLD.rich_content,
         file_id = OLD.file_id, width_pct = OLD.width_pct, checked = OLD.checked,
         toggleable = OLD.toggleable, updated_at = now()
   WHERE c.kind = 'synced' AND c.text = OLD.id::text AND c.id <> OLD.id;
  RETURN OLD;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER page_blocks_unsync_copies_before_delete
  BEFORE DELETE ON page_blocks
  FOR EACH ROW WHEN (OLD.kind <> 'synced')
  EXECUTE FUNCTION page_blocks_unsync_copies();
--> statement-breakpoint
-- Connected work placements become synced blocks. A placement is a paragraph
-- that holds only one link marked with `connected-source=<block id>`.
UPDATE page_blocks p
   SET kind = 'synced', text = s.id::text, rich_content = NULL, updated_at = now()
  FROM page_blocks s
 WHERE p.kind = 'paragraph'
   AND p.file_id IS NULL AND p.ref_folder_id IS NULL AND p.width_pct IS NULL
   AND jsonb_array_length(p.rich_content->'runs') = 1
   AND p.rich_content->'runs'->0->>'href' ~ '[?&]connected-work='
   AND p.rich_content->'runs'->0->>'href' !~ '[?&]promoted-source='
   AND s.id::text = lower(substring(p.rich_content->'runs'->0->>'href'
         FROM '[?&]connected-source=([0-9A-Fa-f-]{36})'))
   AND s.id <> p.id
   AND s.kind IN ('paragraph', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered',
                  'checklist', 'toggle', 'quote', 'callout', 'code', 'diagram', 'table',
                  'image', 'file', 'audio', 'video');
--> statement-breakpoint
-- Other marked links (a promoted statement, a post or a whole document) stay
-- ordinary links. Only the connected-work query is removed.
UPDATE page_blocks p
   SET rich_content = jsonb_set(p.rich_content, '{runs}', (
         SELECT jsonb_agg(CASE WHEN run->>'href' ~ '[?&]connected-work='
                               THEN jsonb_set(run, '{href}', to_jsonb(regexp_replace(run->>'href', '\?[^#]*', '')))
                               ELSE run END ORDER BY ord)
           FROM jsonb_array_elements(p.rich_content->'runs') WITH ORDINALITY AS r(run, ord))),
       updated_at = now()
 WHERE p.rich_content ? 'runs'
   AND jsonb_array_length(p.rich_content->'runs') > 0
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.rich_content->'runs') run
                WHERE run->>'href' ~ '[?&]connected-work=');
--> statement-breakpoint
-- A whole-block facet edge with no placement gets a synced copy at the end of
-- the facet document, so no relationship is lost.
INSERT INTO page_blocks (folder_id, kind, position, text)
SELECT e.facet_id, 'synced',
       COALESCE((SELECT max(b.position) FROM page_blocks b WHERE b.folder_id = e.facet_id), 0)
         + row_number() OVER (PARTITION BY e.facet_id ORDER BY e.created_at, e.block_id),
       e.block_id::text
  FROM page_block_facets e
  JOIN page_blocks s ON s.id = e.block_id
 WHERE s.folder_id IS DISTINCT FROM e.facet_id
   AND s.kind IN ('paragraph', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered',
                  'checklist', 'toggle', 'quote', 'callout', 'code', 'diagram', 'table',
                  'image', 'file', 'audio', 'video')
   AND NOT EXISTS (SELECT 1 FROM page_blocks c
                    WHERE c.folder_id = e.facet_id AND c.kind = 'synced' AND c.text = e.block_id::text);
