-- 0034: the Diagram block (issue #222, M1-B5).
--
-- A diagram is stored as its source text in `text`, the one durable and
-- editable representation; the picture is drawn from it by the client on
-- every read and is never stored. So the kind carries no file, no rich
-- content and no folder reference, and its text obeys the same 4000-character
-- ceiling as every other writing block.
--
-- Widens two named CHECKs in place, exactly as 0028 wrote them plus 'diagram'.
-- Forward only. Re-check the journal number/when against every branch that is
-- open when this merges; 0034 / 1790900000000 was free when #222 was built.
ALTER TABLE page_blocks
  DROP CONSTRAINT page_blocks_kind_check,
  ADD CONSTRAINT page_blocks_kind_check
    CHECK (kind IN ('section', 'paragraph',
                    'heading1', 'heading2', 'heading3',
                    'image', 'folder_ref',
                    'bullet', 'numbered', 'checklist', 'quote', 'callout',
                    'code', 'file', 'audio', 'video', 'diagram')),
  DROP CONSTRAINT page_blocks_text_length_check,
  ADD CONSTRAINT page_blocks_text_length_check
    CHECK (((kind NOT IN ('section', 'heading1', 'heading2', 'heading3'))
             OR char_length(text) BETWEEN 0 AND 120)
           AND (kind NOT IN ('paragraph', 'bullet', 'numbered', 'checklist',
                             'quote', 'callout', 'code', 'diagram')
                OR char_length(text) <= 4000));
