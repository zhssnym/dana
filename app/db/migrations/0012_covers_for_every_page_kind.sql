-- 0012: every page kind can wear a photograph (issues #20 and #100).
--
-- Imran ruled it on #20: "Folders, shelves, and built-in pages like Today
-- should all have the same cover options: gradients, uploads, links, and
-- stock photos. Pictures should belong to the user instead of only a folder."
-- Forward-only, additive, every constraint named because AC-001 asserts the
-- catalog by name.
--
-- Two independent facts, in one migration because they are one ruling.
--
-- ## The shelf gains the two columns a folder got in 0006
--
-- 4.18 has carried `cover_file_id` since 0003 and **no route has ever written
-- it** (#100, measured on the wire: PATCH /shelves/:id { cover_file_id } →
-- 200, body cover_file_id null, and a later GET still null). A shelf
-- therefore cannot wear a picture, and — having no `cover_preset` at all — it
-- cannot wear a gradient either, so of the three page kinds it is the only
-- one that can wear nothing whatsoever.
--
-- The three CHECKs are 0006's, transcribed one object over, and the
-- one-source rule is the folder's rather than 4.20's: a shelf may wear no
-- cover at all, which this table has always admitted and which
-- shelves_cover_file_id_fkey's SET NULL produces when the picture is deleted.
--
-- **The one-source CHECK is written as a disjunction of two `IS NULL` tests
-- and that spelling is load-bearing**, per the fifth bullet of
-- docs/workflow/backend/README.md and the argument written out in 0009. A
-- CHECK fails only on FALSE, and UNKNOWN is as good as TRUE to it, so a rule
-- spelled with a comparison against a possibly-null column admits exactly the
-- row it forbids. `x IS NULL` always yields a real boolean, so
-- `(a IS NULL OR b IS NULL)` is FALSE — and only FALSE — precisely when both
-- are present, which is the state to refuse. AC-372 tries that row against
-- the database rather than trusting this paragraph, because AC-001 asserts a
-- constraint's name and columns and can never see what its expression does.
--
-- ## files gains the rule that says which kinds may stand outside a folder
--
-- `files.folder_id` has been nullable since 0003 and the column is described
-- in 4.16 as "visibility scope; null for avatars". Nothing enforced the
-- "for avatars" half: it lived in `domain/files.ts`, which refused a null
-- folder for every kind but avatar, and in `routes/files.ts`, whose multipart
-- schema required `folder_id` as a uuid. **So the sentence in #20 that the
-- schema is what forbids a folder-less picture is wrong** — the schema never
-- forbade it, two lines of TypeScript did — and the fix is on the server
-- rather than here. What is left for the schema is the rule those two lines
-- are about to start enforcing differently, written down so it is enforced
-- rather than remembered: a row outside a folder is an avatar or a cover, and
-- nothing else. A page image, a comment attachment and a voice note all hang
-- on something that lives in a folder and take that folder's visibility; a
-- cover and an avatar belong to a person.
--
-- Every existing row passes: today's only folder-less rows are avatars.
-- `kind` is NOT NULL, so `kind IN (...)` is never UNKNOWN and the disjunction
-- has the same two-valued honesty as the one above.
ALTER TABLE shelves
  ADD COLUMN cover_preset text,
  ADD COLUMN cover_focal_y integer NOT NULL DEFAULT 50,
  ADD CONSTRAINT shelves_cover_one_source_check CHECK (cover_file_id IS NULL OR cover_preset IS NULL),
  ADD CONSTRAINT shelves_cover_preset_format_check CHECK (cover_preset IS NULL OR cover_preset ~ '^[a-z0-9-]{1,40}$'),
  ADD CONSTRAINT shelves_cover_focal_y_range_check CHECK (cover_focal_y BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE files
  ADD CONSTRAINT files_folderless_kind_check CHECK (folder_id IS NOT NULL OR kind IN ('avatar', 'cover'));
