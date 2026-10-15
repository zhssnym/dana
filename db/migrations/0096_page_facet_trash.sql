-- #671: Soft-delete independent Facets only. This never deletes or moves Page,
-- Task, block, file, reference, receipt, or child Page rows. Old Facets backed
-- by legacy Page rows remain protected until the root-Page conversion is safe.
ALTER TABLE page_facets
  ADD COLUMN deleted_at timestamptz;
--> statement-breakpoint
CREATE INDEX page_facets_trashed_by_page_idx
  ON page_facets (page_id, deleted_at)
  WHERE deleted_at IS NOT NULL;
