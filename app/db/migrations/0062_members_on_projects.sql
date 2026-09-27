-- 0062: people belong to the project, not to each page (step 8).
--
-- After this migration a `folder_members` row exists on a project root only,
-- and a person sees every page of a project they are a member of. Sharing
-- never widens or narrows here: for every person, the set of pages they can
-- see is exactly what it was before, and the migration raises otherwise.
--
-- 1. Split, top-down. A page that is not its project's root and whose
--    people (user ids, presets ignored) differ from its project's in either
--    direction becomes a project of its own with its sub-pages; its rows stay
--    on it. Nobody joins a project they were not on. Deeper pages compare
--    against the project they are in after the pages above them split. A
--    split page's home `page` block in its old parent becomes a `folder_ref`
--    link, which a non-member reads as no access.
-- 2. Presets. On a page that stays in its project with the same people, the
--    project's preset wins. Each difference is written to
--    `folder_access_history` on that page (`migration_initialized`, page
--    preset -> project preset) and counted in a NOTICE.
-- 3. Pending invites on a page that stays inside a project are invalidated:
--    accepting one would add the invitee to the whole project.
-- 4. Responsibilities on such a page move to the project, with their
--    history, unless the person already has an active one there (or on an
--    earlier page); those stay where they are, unread, and are counted.
-- 5. Owner. Every page's owner becomes its project's owner, so account
--    deletion (8.10), which deletes owned folders, never takes pages out of a
--    project that survives.
-- 6. Tasks gain `project_id` (the folder's project, kept by a trigger and a
--    foreign key) and the assignee must be a member of the project.
-- 7. Every membership row on a page that is not a project root is deleted.
--    A personal shelf or colour on such a row is lost (NOTICE with the
--    count); the person still sees the page through its project.
-- 8. The deploy overlap. The old instance keeps serving until this one is
--    healthy. A task it inserts gets its project from the trigger. A
--    membership row it writes on a page that is not a project root (its
--    sub-page and tab copies) is dropped when the person is already on the
--    project and refused otherwise, so nothing it writes widens access. Its
--    reads join memberships to the page itself, so for those minutes it
--    answers 404 on tabs and sub-pages: closed, never open.
--
-- Any invariant mismatch raises `step 8: <check> <id>`; all pending
-- migrations roll back together. Forward only.
LOCK TABLE folders, folder_members, tasks, invites, page_blocks, folder_responsibilities,
  folder_responsibility_history, folder_access_history
  IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
-- Snapshots.
CREATE TEMP TABLE s8_vis_before ON COMMIT DROP AS
  SELECT m.user_id, m.folder_id FROM folder_members m;
--> statement-breakpoint
CREATE TEMP TABLE s8_folders_before ON COMMIT DROP AS
  SELECT f.id, f.parent_folder_id, f.project_id, f.owner_id,
         to_jsonb(f) - 'parent_folder_id' - 'child_position' - 'project_id' - 'tab_position' - 'owner_id' AS rest
    FROM folders f;
--> statement-breakpoint
CREATE TEMP TABLE s8_blocks_before ON COMMIT DROP AS
  SELECT b.id, b.kind, b.ref_folder_id, to_jsonb(b) - 'kind' AS rest FROM page_blocks b;
--> statement-breakpoint
CREATE TEMP TABLE s8_tasks_before ON COMMIT DROP AS
  SELECT t.id, t.folder_id, t.assignee_id FROM tasks t;
--> statement-breakpoint
CREATE TEMP TABLE s8_history_count ON COMMIT DROP AS
  SELECT count(*)::int AS h FROM folder_access_history;
--> statement-breakpoint
-- Depth in the tree as it stands: root-level rows (project roots and tabs)
-- at 0.
CREATE TEMP TABLE s8_depth ON COMMIT DROP AS
  WITH RECURSIVE down(id, depth) AS (
    SELECT id, 0 FROM folders WHERE parent_folder_id IS NULL
    UNION ALL
    SELECT c.id, d.depth + 1 FROM folders c JOIN down d ON c.parent_folder_id = d.id
     WHERE d.depth < 100
  )
  SELECT id, depth FROM down;
--> statement-breakpoint
CREATE TEMP TABLE s8_split (id uuid PRIMARY KEY, old_project uuid NOT NULL, old_parent uuid) ON COMMIT DROP;
--> statement-breakpoint
-- 1. Split, top-down.
DO $$
DECLARE
  bad text;
  d integer;
  top integer;
BEGIN
  SELECT f.id::text INTO bad FROM folders f
   WHERE NOT EXISTS (SELECT 1 FROM s8_depth s WHERE s.id = f.id) LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: page outside the tree %', bad;
  END IF;
  SELECT max(depth) INTO top FROM s8_depth;
  FOR d IN 0..COALESCE(top, 0) LOOP
    INSERT INTO s8_split (id, old_project, old_parent)
    SELECT f.id, f.project_id, f.parent_folder_id FROM folders f
      JOIN s8_depth s ON s.id = f.id AND s.depth = d
     WHERE f.id <> f.project_id
       AND (EXISTS (SELECT m.user_id FROM folder_members m WHERE m.folder_id = f.id
                    EXCEPT SELECT p.user_id FROM folder_members p WHERE p.folder_id = f.project_id)
            OR EXISTS (SELECT p.user_id FROM folder_members p WHERE p.folder_id = f.project_id
                       EXCEPT SELECT m.user_id FROM folder_members m WHERE m.folder_id = f.id));
    -- folders_parent_same_project_fkey's ON UPDATE CASCADE carries each
    -- split page's sub-pages into its new project.
    UPDATE folders f
       SET project_id = f.id, parent_folder_id = NULL, child_position = NULL,
           tab_position = COALESCE(f.tab_position, 'a0')
      FROM s8_split s
     WHERE s.id = f.id AND f.project_id <> f.id;
  END LOOP;
  RAISE NOTICE 'step 8: % pages whose people differed from their project''s became projects: %',
    (SELECT count(*) FROM s8_split),
    (SELECT string_agg(id::text, ', ' ORDER BY id) FROM s8_split);
END
$$;
--> statement-breakpoint
UPDATE page_blocks b SET kind = 'folder_ref'
  FROM s8_split s
 WHERE b.kind = 'page' AND b.ref_folder_id = s.id;
--> statement-breakpoint
-- 2. Presets: the project's wins.
CREATE TEMP TABLE s8_preset ON COMMIT DROP AS
  SELECT m.folder_id, m.user_id, m.access AS page_access, p.access AS project_access
    FROM folder_members m
    JOIN folders f ON f.id = m.folder_id AND f.id <> f.project_id
    JOIN folder_members p ON p.folder_id = f.project_id AND p.user_id = m.user_id
   WHERE m.access <> p.access;
--> statement-breakpoint
INSERT INTO folder_access_history (folder_id, member_id, previous_access, new_access, actor_id, transition)
SELECT folder_id, user_id, page_access, project_access, NULL, 'migration_initialized' FROM s8_preset;
--> statement-breakpoint
-- 3. Invites on a page that stays inside a project.
CREATE TEMP TABLE s8_invites ON COMMIT DROP AS
  SELECT i.id FROM invites i JOIN folders f ON f.id = i.folder_id
   WHERE i.status = 'pending' AND f.id <> f.project_id;
--> statement-breakpoint
UPDATE invites SET status = 'invalidated', responded_at = now()
 WHERE id IN (SELECT id FROM s8_invites);
--> statement-breakpoint
-- 4. Responsibilities. Ended documents always move; of the active ones for
-- one person in one project, the project's own stays and otherwise the
-- earliest moves.
CREATE TEMP TABLE s8_resp ON COMMIT DROP AS
  SELECT r.id, r.folder_id, f.project_id, r.member_id, r.ended_at,
         row_number() OVER (PARTITION BY f.project_id, r.member_id, (r.ended_at IS NULL)
                            ORDER BY r.created_at, r.id) AS nth
    FROM folder_responsibilities r
    JOIN folders f ON f.id = r.folder_id AND f.id <> f.project_id;
--> statement-breakpoint
CREATE TEMP TABLE s8_resp_move ON COMMIT DROP AS
  SELECT s.id, s.folder_id, s.project_id FROM s8_resp s
   WHERE s.ended_at IS NOT NULL
      OR (s.nth = 1 AND NOT EXISTS (SELECT 1 FROM folder_responsibilities p
                                     WHERE p.folder_id = s.project_id AND p.member_id = s.member_id
                                       AND p.ended_at IS NULL));
--> statement-breakpoint
UPDATE folder_responsibilities r SET folder_id = s.project_id
  FROM s8_resp_move s WHERE s.id = r.id;
--> statement-breakpoint
UPDATE folder_responsibility_history h SET folder_id = s.project_id
  FROM s8_resp_move s WHERE s.id = h.responsibility_id;
--> statement-breakpoint
UPDATE folder_responsibility_history h SET folder_id = f.project_id
  FROM folders f
 WHERE f.id = h.folder_id AND f.id <> f.project_id AND h.responsibility_id IS NULL;
--> statement-breakpoint
-- 5. Owner.
UPDATE folders f SET owner_id = p.owner_id
  FROM folders p
 WHERE p.id = f.project_id AND f.id <> f.project_id AND f.owner_id <> p.owner_id;
--> statement-breakpoint
-- 6. Tasks.
ALTER TABLE tasks ADD COLUMN project_id uuid;
--> statement-breakpoint
UPDATE tasks t SET project_id = f.project_id FROM folders f WHERE f.id = t.folder_id;
--> statement-breakpoint
ALTER TABLE tasks
  ALTER COLUMN project_id SET NOT NULL,
  ADD CONSTRAINT tasks_folder_project_fkey
    FOREIGN KEY (folder_id, project_id) REFERENCES folders(id, project_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  ADD CONSTRAINT tasks_assignee_project_member_fkey
    FOREIGN KEY (project_id, assignee_id) REFERENCES folder_members(folder_id, user_id)
    ON DELETE SET NULL (assignee_id);
--> statement-breakpoint
-- Dropped only now: while it stood, deleting a sub-page's membership rows
-- would have unassigned that sub-page's tasks.
ALTER TABLE tasks DROP CONSTRAINT tasks_assignee_membership_fkey;
--> statement-breakpoint
CREATE INDEX tasks_project_assignee_idx ON tasks (project_id, assignee_id);
--> statement-breakpoint
-- A task's project is its folder's, whoever writes it: a new task, a task
-- moved to another page, and the old instance's inserts during the overlap.
-- A page moving to another project carries its tasks through the foreign
-- key's ON UPDATE CASCADE.
CREATE FUNCTION tasks_project_from_folder() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  SELECT f.project_id INTO NEW.project_id FROM folders f WHERE f.id = NEW.folder_id;
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER tasks_project_from_folder BEFORE INSERT OR UPDATE OF folder_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_project_from_folder();
--> statement-breakpoint
-- 7. Memberships leave every page that is not a project root.
DO $$
BEGIN
  RAISE NOTICE 'step 8: % personal shelves or colours on pages inside a project were dropped',
    (SELECT count(*) FROM folder_members m JOIN folders f ON f.id = m.folder_id
      WHERE f.id <> f.project_id AND (m.shelf_name IS NOT NULL OR m.color IS NOT NULL));
END
$$;
--> statement-breakpoint
DELETE FROM folder_members m USING folders f
 WHERE f.id = m.folder_id AND f.id <> f.project_id;
--> statement-breakpoint
-- 8. The guard, which also covers the overlap: a membership row lives on a
-- project root. One the person already has through the project is dropped
-- (the old instance's copies); any other is refused.
CREATE FUNCTION folder_members_on_project_root() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  project uuid;
BEGIN
  SELECT f.project_id INTO project FROM folders f WHERE f.id = NEW.folder_id;
  IF project IS NULL OR project = NEW.folder_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM folder_members m WHERE m.folder_id = project AND m.user_id = NEW.user_id) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'step 8: people belong to the project, not to page %', NEW.folder_id
    USING ERRCODE = 'check_violation', CONSTRAINT = 'folder_members_on_project_root';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER folder_members_on_project_root BEFORE INSERT ON folder_members
  FOR EACH ROW EXECUTE FUNCTION folder_members_on_project_root();
--> statement-breakpoint
-- Invariants.
DO $$
DECLARE
  bad text;
  n integer;
BEGIN
  -- Everyone sees exactly the pages they saw.
  SELECT (d.user_id::text || ' ' || d.folder_id::text) INTO bad FROM (
    (SELECT user_id, folder_id FROM s8_vis_before
     EXCEPT
     SELECT m.user_id, f.id FROM folders f JOIN folder_members m ON m.folder_id = f.project_id)
    UNION ALL
    (SELECT m.user_id, f.id FROM folders f JOIN folder_members m ON m.folder_id = f.project_id
     EXCEPT
     SELECT user_id, folder_id FROM s8_vis_before)
  ) d
  LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: visibility changed %', bad;
  END IF;

  SELECT m.folder_id::text INTO bad FROM folder_members m JOIN folders f ON f.id = m.folder_id
   WHERE f.id <> f.project_id LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: membership left on a page %', bad;
  END IF;

  -- A root's own rows are untouched.
  SELECT m.folder_id::text INTO bad FROM folder_members m
   WHERE NOT EXISTS (SELECT 1 FROM s8_vis_before v WHERE v.folder_id = m.folder_id AND v.user_id = m.user_id)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: membership added %', bad;
  END IF;

  SELECT f.id::text INTO bad FROM folders f JOIN folders p ON p.id = f.project_id
   WHERE f.owner_id <> p.owner_id LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: owner differs from the project''s %', bad;
  END IF;

  -- Folders: only the split pages moved, only project and owner changed
  -- elsewhere, and a page's project is its parent's.
  SELECT f.id::text INTO bad FROM folders f
    LEFT JOIN s8_folders_before b ON b.id = f.id
    LEFT JOIN s8_split s ON s.id = f.id
   WHERE b.id IS NULL
      OR b.rest IS DISTINCT FROM (to_jsonb(f) - 'parent_folder_id' - 'child_position' - 'project_id' - 'tab_position' - 'owner_id')
      OR (s.id IS NULL AND f.parent_folder_id IS DISTINCT FROM b.parent_folder_id)
      OR (s.id IS NOT NULL AND (f.parent_folder_id IS NOT NULL OR f.project_id <> f.id))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: folder changed %', bad;
  END IF;
  SELECT count(*) INTO n FROM s8_folders_before;
  IF n <> (SELECT count(*) FROM folders) THEN
    RAISE EXCEPTION 'step 8: folder count changed';
  END IF;
  SELECT f.id::text INTO bad FROM folders f JOIN folders p ON p.id = f.parent_folder_id
   WHERE f.project_id <> p.project_id LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: page outside its parent''s project %', bad;
  END IF;

  -- Tasks: none moved, none unassigned, each carries its folder's project.
  SELECT t.id::text INTO bad FROM tasks t
    LEFT JOIN s8_tasks_before b ON b.id = t.id
    JOIN folders f ON f.id = t.folder_id
   WHERE b.id IS NULL OR t.folder_id <> b.folder_id
      OR t.assignee_id IS DISTINCT FROM b.assignee_id OR t.project_id <> f.project_id
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: task changed %', bad;
  END IF;
  IF (SELECT count(*) FROM s8_tasks_before) <> (SELECT count(*) FROM tasks) THEN
    RAISE EXCEPTION 'step 8: task count changed';
  END IF;

  -- Blocks: the only change is a split page's home block becoming a link.
  SELECT b.id::text INTO bad FROM page_blocks b
    LEFT JOIN s8_blocks_before o ON o.id = b.id
   WHERE o.id IS NULL
      OR o.rest IS DISTINCT FROM (to_jsonb(b) - 'kind')
      OR (b.kind <> o.kind
          AND NOT (o.kind = 'page' AND b.kind = 'folder_ref'
                   AND EXISTS (SELECT 1 FROM s8_split s WHERE s.id = b.ref_folder_id)))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: block changed %', bad;
  END IF;
  IF (SELECT count(*) FROM s8_blocks_before) <> (SELECT count(*) FROM page_blocks) THEN
    RAISE EXCEPTION 'step 8: block count changed';
  END IF;
  SELECT b.id::text INTO bad FROM page_blocks b JOIN folders c ON c.id = b.ref_folder_id
   WHERE b.kind = 'page' AND c.parent_folder_id IS DISTINCT FROM b.folder_id
     AND EXISTS (SELECT 1 FROM s8_split s WHERE s.id = c.id)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: home block left for a split page %', bad;
  END IF;

  SELECT i.id::text INTO bad FROM invites i JOIN folders f ON f.id = i.folder_id
   WHERE i.status = 'pending' AND f.id <> f.project_id LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: pending invite on a page %', bad;
  END IF;

  SELECT count(*) INTO n FROM folder_access_history;
  IF n - (SELECT h FROM s8_history_count) <> (SELECT count(*) FROM s8_preset) THEN
    RAISE EXCEPTION 'step 8: preset history rows %', n;
  END IF;

  RAISE NOTICE 'step 8: % presets on pages gave way to the project''s: %',
    (SELECT count(*) FROM s8_preset),
    (SELECT string_agg(folder_id::text || '/' || user_id::text || ' ' || page_access || '->' || project_access,
                       ', ' ORDER BY folder_id, user_id) FROM s8_preset);
  RAISE NOTICE 'step 8: % pending invites on pages inside a project were invalidated',
    (SELECT count(*) FROM s8_invites);
  RAISE NOTICE 'step 8: % Responsibilities moved to their project; % stayed on their page (one already active)',
    (SELECT count(*) FROM s8_resp_move),
    (SELECT count(*) FROM s8_resp) - (SELECT count(*) FROM s8_resp_move);
END
$$;
