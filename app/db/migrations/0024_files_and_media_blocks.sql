-- 0024: files and media blocks in the composer (issue #220, M1-B3).
--
-- Migration number 0024 and journal `when` 1789900000000 were assigned before
-- this was written, with four branches open at once: 0020 (#226), 0021 (#219)
-- and 0023 (#228) belong to other live branches. CLAUDE.md records why the
-- `when` rather than the filename is the apply gate, and why two branches each
-- taking "the next free one" is a production incident rather than a merge
-- conflict.
--
-- ## What this widens, and the one thing it deliberately does not add
--
-- Four widenings, all of them in place, all of them admitting a strictly
-- larger set than before. Every existing row therefore passes by
-- construction, and no backfill exists or is needed.
--
--   1. `files_kind_check` gains `audio` and `video`. `voice` stays a separate
--      kind and keeps its own duration rule: a recorded voice note on a
--      comment thread is not the same thing as an uploaded composer audio
--      track, and #220 R1 says so in terms.
--   2. `files_folderless_kind_check` gains `file`, `audio` and `video`, which
--      leaves `voice` as the only kind that still requires a folder. A voice
--      note hangs on a comment thread and a thread lives in a folder; a
--      composer asset belongs to its page, and not every kind of page is a
--      folder (4.18's shelf is private and has none). A folder-less row of
--      any of these kinds is its owner's alone — `readableFileScope` in
--      src/server/domain/files.ts has said so since issue #100 and needed no
--      widening at all, because its folder-less arm names `avatar` and then
--      falls through to ownership for everything else.
--   3. `page_blocks_kind_check` gains `file`, `audio` and `video` beside the
--      existing `image`. A media block references one stored file by
--      `file_id` and copies none of that file's name, MIME or byte size: the
--      `files` row stays the single authority on all three.
--   4. `page_blocks_width_pct_kind_check` gains `video`. #220 R1 extends the
--      restrained centred width to previewable video and leaves audio at its
--      natural compact player width; a generic file block does not resize in
--      M1. So the admitted set is image and video, and nothing else.
--
-- ## The constraint this migration does not write, and why
--
-- The obvious fifth widening is a CHECK confining `file_id` to the four media
-- kinds. It is not here, and that is a decision rather than an oversight.
-- The legacy whole-page writer (7.16's `PUT /pages`, and `insert_block`) has
-- always accepted a `file_id` on a `section` or a `paragraph` block, so a
-- production row may carry one today. A CHECK is validated against every
-- existing row the moment it is added, there is no down migration, and a
-- migration that fails on deploy is recovered by a fix-forward migration or a
-- restore. Refusing a shape that live data may already hold is therefore
-- exactly the wrong thing to put in a forward-only migration on evidence this
-- branch cannot gather. The rule is stated where it can be enforced without
-- that risk: in the document contract's `put_block` schema and in
-- `applyDocument`'s pre-write validation, both of which refuse before the
-- first write.
--
-- The rule that actually matters for #220 cannot be a CHECK in any case,
-- because it spans two tables: a block of kind `file` must name a `files` row
-- of kind `file`, an `audio` block an `audio` row, a `video` block a `video`
-- row. That is the whole of "insertion mode is preserved, not re-derived" —
-- the same JPG is an Image block when dropped as media and a File block when
-- inserted through the File command, and the server keeps the declared,
-- validated treatment instead of reading the extension back off the filename.
-- It lives in `applyDocument` beside the scope gate, ahead of every write.
--
-- ## Every constraint keeps its name and its column list
--
-- All four are dropped and re-added under the same name over the same
-- columns, so AC-001's catalog does not move for any of them. That is exactly
-- the class of change docs/workflow/backend.md warns is invisible to
-- the catalog: only a behavioural case can see it, and AC-490 to AC-507 are
-- those cases.
ALTER TABLE files
  DROP CONSTRAINT files_kind_check,
  ADD CONSTRAINT files_kind_check
    CHECK (kind IN ('image', 'file', 'voice', 'cover', 'avatar',
                    'audio', 'video')),
  DROP CONSTRAINT files_folderless_kind_check,
  ADD CONSTRAINT files_folderless_kind_check
    CHECK (folder_id IS NOT NULL
           OR kind IN ('avatar', 'cover', 'image', 'file', 'audio', 'video'));
--> statement-breakpoint
ALTER TABLE page_blocks
  DROP CONSTRAINT page_blocks_kind_check,
  ADD CONSTRAINT page_blocks_kind_check
    CHECK (kind IN ('section', 'paragraph', 'image', 'folder_ref',
                    'bullet', 'numbered', 'checklist', 'quote', 'callout',
                    'code', 'file', 'audio', 'video')),
  DROP CONSTRAINT page_blocks_width_pct_kind_check,
  ADD CONSTRAINT page_blocks_width_pct_kind_check
    CHECK (width_pct IS NULL OR kind IN ('image', 'video'));
