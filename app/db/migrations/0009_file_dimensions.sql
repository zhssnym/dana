-- 0009: files gain the shape of the picture they hold (issue #27, spec item
-- 13.47). Forward-only, additive, every constraint named because AC-001
-- asserts the catalog by name.
--
-- The columns live on the file rather than on the block that shows it,
-- because one image can be used by several blocks and its shape is a fact
-- about the file. A ratio stored per block would have to be written again
-- every time the same picture was placed, and the two copies would be free
-- to disagree.
--
-- **Nullable, and null means unknown rather than square, absent or zero.**
-- Every row stored before this migration keeps null. The bytes are on disk
-- and re-reading them is possible, but a backfill is a production data
-- operation and the owner's call, so nothing here writes one; every consumer
-- must treat null as "nothing is known about this picture's shape" and
-- behave exactly as it did before these columns existed.
--
-- Two named CHECKs, and each is one sentence.
--
-- files_dimensions_pair_check carries the pairing and the positivity
-- together because they are one fact rather than two. The columns exist so a
-- reader can reserve a box of the right proportion before the bytes arrive,
-- and a width without a height, or a zero on either side, is a ratio that
-- cannot be computed. Half a shape is not a smaller fact than a whole one,
-- it is an unusable one, so the constraint admits both or neither.
--
-- **Its shape is dictated by three-valued logic and the obvious spelling is
-- broken**, which the adversarial half of AC-362 caught before this landed.
-- The natural way to write it,
--   ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0))
-- admits exactly the row it exists to refuse: with width null and height 24
-- the first branch is FALSE and the second is NULL, because `NULL > 0` is
-- NULL, and FALSE OR NULL is NULL. A CHECK passes on NULL as readily as on
-- TRUE, so half a pair walks straight in. The spelling below never compares a
-- possibly-null value until it knows both are present: `IS NULL` yields a
-- real boolean always, so the equality between the two is a plain boolean,
-- and the positivity clause is reached only when the pair is present.
--
-- files_dimensions_kind_check keeps the columns to the kinds that pass
-- through sharp on the way in, which is the discipline
-- files_duration_voice_check already applies to a voice note's length and
-- page_blocks_width_pct_kind_check to a block's width. A voice note and a
-- downloaded attachment have no dimensions to record, and a row claiming
-- otherwise would be a reservation drawn around nothing.
ALTER TABLE files
  ADD COLUMN width integer,
  ADD COLUMN height integer,
  ADD CONSTRAINT files_dimensions_pair_check CHECK ((width IS NULL) = (height IS NULL) AND (width IS NULL OR (width > 0 AND height > 0))),
  ADD CONSTRAINT files_dimensions_kind_check CHECK (width IS NULL OR kind IN ('image', 'cover', 'avatar'));
