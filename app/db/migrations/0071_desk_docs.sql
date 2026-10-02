-- 0071: Desk is private Work plus documentation, never a Discussion surface.
--
-- Existing Discussion rows and tabs are deliberately preserved. They may hold
-- history from before this rule and deleting them would be data loss; the
-- current client no longer exposes them and new creation is refused. This
-- migration only gives every Desk the documentation shape the product now
-- promises:
--
-- 1. the Desk root is Work;
-- 2. an untouched migrated Purpose tab becomes Docs without moving its body;
-- 3. a Desk with no live Docs tab gets one;
-- 4. live Desk tabs are re-keyed with Work first, Docs next, then any other
--    documentation pages, and legacy Discussion last.
--
-- Forward only.
LOCK TABLE folders IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
UPDATE folders
   SET kind = 'work'
 WHERE id = project_id
   AND is_default
   AND kind IS DISTINCT FROM 'work';
--> statement-breakpoint
UPDATE folders t
   SET name = 'Docs'
  FROM folders r
  JOIN folder_facets ff ON ff.folder_id = r.id AND ff.kind = 'purpose'
 WHERE r.id = r.project_id
   AND r.is_default
   AND t.id = ff.id
   AND t.project_id = r.id
   AND t.kind = 'doc'
   AND t.name = 'Purpose'
   AND t.deleted_at IS NULL
   AND t.archived_at IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM folders d
      WHERE d.project_id = r.id
        AND d.kind = 'doc'
        AND d.name = 'Docs'
        AND d.deleted_at IS NULL
        AND d.archived_at IS NULL
   );
--> statement-breakpoint
INSERT INTO folders (id, owner_id, name, project_id, kind, tab_position)
SELECT gen_random_uuid(), r.owner_id, 'Docs', r.id, 'doc',
       migration_util.key_after((
         SELECT max(t.tab_position COLLATE "C")
           FROM folders t
          WHERE t.project_id = r.id
            AND t.tab_position IS NOT NULL
       ))
  FROM folders r
 WHERE r.id = r.project_id
   AND r.is_default
   AND r.deleted_at IS NULL
   AND r.archived_at IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM folders d
      WHERE d.project_id = r.id
        AND d.kind = 'doc'
        AND d.name = 'Docs'
        AND d.deleted_at IS NULL
        AND d.archived_at IS NULL
   );
--> statement-breakpoint
DO $$
DECLARE
  desk record;
  tab record;
  k text;
BEGIN
  FOR desk IN
    SELECT id
      FROM folders
     WHERE id = project_id
       AND is_default
       AND deleted_at IS NULL
       AND archived_at IS NULL
  LOOP
    SELECT max(tab_position COLLATE "C")
      INTO k
      FROM folders
     WHERE project_id = desk.id
       AND tab_position IS NOT NULL;

    FOR tab IN
      SELECT id
        FROM folders
       WHERE project_id = desk.id
         AND tab_position IS NOT NULL
         AND deleted_at IS NULL
         AND archived_at IS NULL
       ORDER BY
         CASE
           WHEN id = desk.id THEN 0
           WHEN kind = 'doc' AND name = 'Docs' THEN 1
           WHEN kind = 'doc' THEN 2
           WHEN kind = 'discussion' THEN 4
           ELSE 3
         END,
         tab_position COLLATE "C",
         id
    LOOP
      k := migration_util.key_after(k);
      UPDATE folders SET tab_position = k WHERE id = tab.id;
    END LOOP;
  END LOOP;
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  bad text;
BEGIN
  SELECT r.id::text
    INTO bad
    FROM folders r
   WHERE r.id = r.project_id
     AND r.is_default
     AND r.deleted_at IS NULL
     AND r.archived_at IS NULL
     AND (
       r.kind <> 'work'
       OR NOT EXISTS (
         SELECT 1
           FROM folders d
          WHERE d.project_id = r.id
            AND d.kind = 'doc'
            AND d.name = 'Docs'
            AND d.deleted_at IS NULL
            AND d.archived_at IS NULL
       )
       OR EXISTS (
         SELECT 1
           FROM folders t
          WHERE t.project_id = r.id
            AND t.tab_position IS NOT NULL
            AND t.deleted_at IS NULL
            AND t.archived_at IS NULL
            AND t.id <> r.id
            AND t.tab_position < r.tab_position
       )
     )
   LIMIT 1;

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '0071: Desk shape not established %', bad;
  END IF;
END
$$;