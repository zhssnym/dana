-- 0038: any block nests (wave 2, unit W-B).
--
-- `list_parent_block_id` becomes the general block parent: any block but a
-- Section may sit under another block of the same document, on every home
-- (folder, facet, Task, shelf). It is NOT renamed. Which parent kind a child
-- may name, that the parent precedes it, the one-Section rule and the depth
-- ceiling are cross-row rules, enforced by the document transaction
-- (`mayNestUnder` and `domain/document-outline.ts`), not here.
--
-- `toggleable` marks a presentation heading (heading1-3) that folds its
-- children, Notion's toggle heading. Null means an ordinary heading.
--
-- Both CHECKs only widen or add a nullable column: every existing row passes
-- (every stored list parent is on a non-section kind and never itself; every
-- existing row has a null `toggleable`). Forward only. 0038 / 1791300000000
-- are the numbers the wave-2 plan fixed.
ALTER TABLE page_blocks
  DROP CONSTRAINT page_blocks_list_parent_kind_check,
  ADD CONSTRAINT page_blocks_list_parent_kind_check
    CHECK (list_parent_block_id IS NULL
           OR (kind <> 'section' AND list_parent_block_id <> id)),
  ADD COLUMN toggleable boolean,
  ADD CONSTRAINT page_blocks_toggleable_kind_check
    CHECK (toggleable IS NULL OR kind IN ('heading1', 'heading2', 'heading3'));
