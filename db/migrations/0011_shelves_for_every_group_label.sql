-- Issue #65: a shelf in the sidebar does not open its shelf page.
--
-- 9.1 says the Library "holds the viewer's shelves and folders as one ordered
-- list", that "a shelf is a collapsible group of folder rows headed by its
-- name", and its roles table makes every shelf row a link. 4.18 says the
-- membership of a shelf *is* folder_members.label, and that the API holds the
-- label and the shelf's name in step. Together those say that every distinct
-- label a person carries names a shelf, because a group heading with no
-- shelves row behind it has no id, and therefore no /app/shelves/:id to link
-- to and no page to open.
--
-- Nothing ever established that. folder_members.label has existed since
-- 0000_core_schema; the shelves table arrived empty in 0003_v2_expand and no
-- migration since has filled it from the labels that were already there. So
-- every folder group an account made before 7.16 shipped is a heading the
-- client draws as plain text, which is exactly the reported symptom: the
-- shelf "stays only as a sidebar group instead of opening its page". This is
-- the one-off half of the fix; the standing half is in
-- src/server/domain/folders.ts, where writing a label now makes the shelf it
-- names if there is not one already.
--
-- Three notes on the shape of the statement.
--
-- The length bounds already agree, so no row can be refused for its name:
-- folder_members_label_length_check and shelves_name_length_check are both
-- BETWEEN 1 AND 40 (10.3 gives the personal label and the shelf name one row).
--
-- Labels on soft-deleted folders are included deliberately. Excluding them
-- would leave a label with no shelf behind it the moment its folder came back
-- out of the trash, which is this defect again by a slower route; and 9.1's
-- own model since S17b is that a shelf outlives its folders, so a group that
-- currently has none is a legitimate empty shelf rather than a row to skip.
-- The visible consequence is small and is stated here rather than discovered:
-- a label carried only by trashed folders becomes an empty shelf in the
-- Library where the heading used to be absent.
--
-- ON CONFLICT rather than NOT EXISTS so that an account that already has the
-- shelf, which is every account that made its groups through the current
-- client, is untouched. The migration is therefore a no-op for them and is
-- safe to re-run, which is what lets AC-367 execute this file's own SQL
-- rather than a second copy of it.
INSERT INTO shelves (user_id, name)
SELECT DISTINCT m.user_id, m.label
  FROM folder_members m
 WHERE m.label IS NOT NULL
ON CONFLICT (user_id, name) DO NOTHING;
