-- 0028_purpose_document.sql
-- Issue #211 (M1-G), on Hassan's technical ruling:
-- https://github.com/zhssnym/dana/issues/211#issuecomment-5801396721
--
-- Purpose reuses 4.17 page_blocks through the native Purpose facet created by
-- 0027. This migration adds no Purpose table and no new nullable payload field.
-- It widens four named CHECKs in place:
--
-- * heading1/heading2/heading3 are authored document headings. They are not
--   Main Work Sections and carry no section_block_id semantics.
-- * a facet-homed list item may name another list item as its writing parent.
--   The application still proves that both rows are in the same facet and that
--   the parent precedes the child before the first write.
--
-- Forward only. Re-check the journal number/when against every branch that is
-- open when this merges; 0028 / 1790300000000 was free when #211 was ruled.
ALTER TABLE page_blocks
  DROP CONSTRAINT page_blocks_kind_check,
  ADD CONSTRAINT page_blocks_kind_check
    CHECK (kind IN ('section', 'paragraph',
                    'heading1', 'heading2', 'heading3',
                    'image', 'folder_ref',
                    'bullet', 'numbered', 'checklist', 'quote', 'callout',
                    'code', 'file', 'audio', 'video')),
  DROP CONSTRAINT page_blocks_text_length_check,
  ADD CONSTRAINT page_blocks_text_length_check
    CHECK (((kind NOT IN ('section', 'heading1', 'heading2', 'heading3'))
             OR char_length(text) BETWEEN 0 AND 120)
           AND (kind NOT IN ('paragraph', 'bullet', 'numbered', 'checklist',
                             'quote', 'callout', 'code')
                OR char_length(text) <= 4000)),
  DROP CONSTRAINT page_blocks_rich_content_check,
  ADD CONSTRAINT page_blocks_rich_content_check
    CHECK (rich_content IS NULL
           OR (kind IN ('section', 'paragraph',
                        'heading1', 'heading2', 'heading3',
                        'bullet', 'numbered', 'checklist', 'quote', 'callout')
               AND octet_length(rich_content::text) <= 65536
               AND rich_content->>'version' = '1')),
  DROP CONSTRAINT page_blocks_list_parent_kind_check,
  ADD CONSTRAINT page_blocks_list_parent_kind_check
    CHECK (list_parent_block_id IS NULL
           OR ((folder_id IS NOT NULL OR facet_id IS NOT NULL)
               AND kind IN ('bullet', 'numbered', 'checklist')
               AND list_parent_block_id <> id));
