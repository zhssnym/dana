-- Issue #488: a whole persisted block may reference one or more facet tabs.
--
-- Inline facet references remain Dana Links inside rich_content. This table is
-- deliberately only for the block-owned form needed by image/file/media and
-- by people who mean "this whole block belongs to this facet". The target is
-- the current step-7 tab/page (`folders.id`), not the retired folder_facets
-- row. Same-project and Doc-tab eligibility are state across tables and are
-- therefore enforced by the transactional write, not guessed by a CHECK that
-- cannot see those rows. There is no actor copy: the edge is current relation
-- state, not history, and account deletion should not need another provenance
-- retention rule for a fact that simply follows its two endpoints.
CREATE TABLE page_block_facets (
  block_id uuid NOT NULL,
  facet_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_block_facets_pkey PRIMARY KEY (block_id, facet_id),
  CONSTRAINT page_block_facets_block_id_fkey FOREIGN KEY (block_id)
    REFERENCES page_blocks(id) ON DELETE CASCADE,
  CONSTRAINT page_block_facets_facet_id_fkey FOREIGN KEY (facet_id)
    REFERENCES folders(id) ON DELETE CASCADE
);
--> statement-breakpoint
-- The primary key serves block -> facets. Connected work reads the inverse.
CREATE INDEX page_block_facets_facet_id_block_id_idx
  ON page_block_facets (facet_id, block_id);