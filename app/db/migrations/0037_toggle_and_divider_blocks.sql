-- 0037: the Toggle and Divider blocks (the Notion-style editor).
--
-- A toggle is a list item that holds writing: rich text like a bullet, the
-- same 4000-character ceiling, and a list parent like any list item. Under a
-- toggle, and only there, a paragraph, a quote, a callout, a code block or a
-- divider nests too, through the same `list_parent_block_id`; which parent
-- kind a child may name is a cross-row rule, so it is enforced by the
-- document transaction (`mayNestUnder`) and not here. A divider is a
-- horizontal rule: no text, no rich content, no file.
--
-- Widens four named CHECKs in place, exactly as 0028 and 0034 wrote them plus
-- the new kinds. Forward only. Re-check the journal number/when against every
-- branch that is open when this merges; 0037 / 1791200000000 was chosen when
-- this was built. There is no 0035: this migration was once numbered 0035 and
-- was renumbered past 0036; the gap is harmless (the journal, not the file
-- number, orders migrations).
ALTER TABLE page_blocks
  DROP CONSTRAINT page_blocks_kind_check,
  ADD CONSTRAINT page_blocks_kind_check
    CHECK (kind IN ('section', 'paragraph',
                    'heading1', 'heading2', 'heading3',
                    'image', 'folder_ref',
                    'bullet', 'numbered', 'checklist', 'toggle', 'quote',
                    'callout', 'code', 'file', 'audio', 'video', 'diagram',
                    'divider')),
  DROP CONSTRAINT page_blocks_text_length_check,
  ADD CONSTRAINT page_blocks_text_length_check
    CHECK (((kind NOT IN ('section', 'heading1', 'heading2', 'heading3'))
             OR char_length(text) BETWEEN 0 AND 120)
           AND (kind NOT IN ('paragraph', 'bullet', 'numbered', 'checklist',
                             'toggle', 'quote', 'callout', 'code', 'diagram')
                OR char_length(text) <= 4000)),
  DROP CONSTRAINT page_blocks_rich_content_check,
  ADD CONSTRAINT page_blocks_rich_content_check
    CHECK (rich_content IS NULL
           OR (kind IN ('section', 'paragraph',
                        'heading1', 'heading2', 'heading3',
                        'bullet', 'numbered', 'checklist', 'toggle', 'quote',
                        'callout')
               AND octet_length(rich_content::text) <= 65536
               AND rich_content->>'version' = '1')),
  DROP CONSTRAINT page_blocks_list_parent_kind_check,
  ADD CONSTRAINT page_blocks_list_parent_kind_check
    CHECK (list_parent_block_id IS NULL
           OR ((folder_id IS NOT NULL OR facet_id IS NOT NULL)
               AND kind IN ('bullet', 'numbered', 'checklist', 'toggle',
                            'paragraph', 'quote', 'callout', 'code', 'divider')
               AND list_parent_block_id <> id));
