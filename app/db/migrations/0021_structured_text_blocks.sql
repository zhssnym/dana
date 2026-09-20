-- 0021: Dana-native structured writing blocks on the folder canvas
-- (issue #219, M1-B2).
--
-- Migration number 0021 and journal `when` 1789600000000 were assigned before
-- this was written, with four branches open at once. CLAUDE.md records why the
-- `when` rather than the filename is the apply gate, and why two branches each
-- taking "the next free one" is a production incident rather than a merge
-- conflict.
--
-- ## What this adds, and the one thing it deliberately does not
--
-- Six new block kinds -- bullet, numbered, checklist, quote, callout and code --
-- persisted as explicit Dana kinds. BlockNote is the editor; it is not the
-- storage format, so there is no opaque editor document stored anywhere and no
-- generic props bag. The only additional persisted state the six kinds need is
-- a checklist item's tick, which is `checked`.
--
-- `list_parent_block_id` is a second, separate parent relation. It is NOT
-- `section_block_id` widened, and the two are independent on purpose:
-- `section_block_id` is Work grouping (which Section a block belongs to) and
-- `list_parent_block_id` is writing structure (which list item a list item is
-- nested under). A nested list item inside a Section carries both, and neither
-- is derived from the other. Overloading one column to mean both would have
-- made a nested checklist item's Section unreadable.
--
-- ON DELETE SET NULL, matching `page_blocks_section_block_id_fkey`: deleting a
-- list parent must not delete the writing underneath it. The child is promoted
-- to the top level of its list rather than destroyed.
--
-- ## Every constraint is widened rather than replaced
--
-- The three CHECKs below keep their names and their column lists, so AC-001's
-- catalog does not move for them, which is exactly the class of change
-- docs/workflow/backend/README.md warns is invisible to the catalog: only a
-- behavioural case sees it, and AC-460 to AC-463 are those cases. Every
-- existing row passes by construction, because each of the three admits a
-- strictly larger set than before.
--
-- `code` is absent from the rich-content list on purpose: a code block is plain
-- text and nothing in Dana formats it (R1 decision 6).
ALTER TABLE page_blocks
  ADD COLUMN list_parent_block_id uuid,
  ADD COLUMN checked boolean,
  ADD CONSTRAINT page_blocks_list_parent_block_id_fkey
    FOREIGN KEY (list_parent_block_id) REFERENCES page_blocks(id) ON DELETE SET NULL,
  ADD CONSTRAINT page_blocks_list_parent_kind_check
    CHECK (list_parent_block_id IS NULL
           OR (folder_id IS NOT NULL
               AND kind IN ('bullet', 'numbered', 'checklist')
               AND list_parent_block_id <> id)),
  ADD CONSTRAINT page_blocks_checked_kind_check
    CHECK ((checked IS NULL) = (kind <> 'checklist')),
  DROP CONSTRAINT page_blocks_kind_check,
  ADD CONSTRAINT page_blocks_kind_check
    CHECK (kind IN ('section', 'paragraph', 'image', 'folder_ref',
                    'bullet', 'numbered', 'checklist', 'quote', 'callout',
                    'code')),
  DROP CONSTRAINT page_blocks_text_length_check,
  ADD CONSTRAINT page_blocks_text_length_check
    CHECK ((kind <> 'section' OR char_length(text) BETWEEN 0 AND 120)
           AND (kind NOT IN ('paragraph', 'bullet', 'numbered', 'checklist',
                             'quote', 'callout', 'code')
                OR char_length(text) <= 4000)),
  DROP CONSTRAINT page_blocks_rich_content_check,
  ADD CONSTRAINT page_blocks_rich_content_check
    CHECK (rich_content IS NULL
           OR (kind IN ('section', 'paragraph', 'bullet', 'numbered',
                        'checklist', 'quote', 'callout')
               AND octet_length(rich_content::text) <= 65536
               AND rich_content->>'version' = '1'));
--> statement-breakpoint
CREATE INDEX page_blocks_list_parent_block_id_idx
  ON page_blocks (list_parent_block_id)
  WHERE list_parent_block_id IS NOT NULL;
