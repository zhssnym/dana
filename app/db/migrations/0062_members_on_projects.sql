-- 0062: people belong to the project, not to each page (step 8).
--
-- After this migration a `folder_members` row is read on a project root only,
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
--    link, which a non-member reads as no access. A project the split leaves
--    with discussions and no Discussion tab gets one (0061's rule), so no
--    thread drops out of the interface.
--    A live page or tab of a project whose root is in Trash (a trash that
--    skipped what the trasher had no right to trash) splits too: the purge
--    would make it a project of its own anyway, and its Responsibilities
--    must not move onto a root the purge deletes.
-- 2. Presets. On a page that stays in its project with the same people, the
--    project's preset wins. Each difference is written to
--    `folder_access_history` on that page (`migration_initialized`, page
--    preset -> project preset) and counted in a NOTICE.
-- 3. Pending invites on a page that stays inside a project are invalidated:
--    accepting one would add the invitee to the whole project. So are
--    pending invites on a project root whose project has sub-pages: accepting
--    one used to add the invitee to the root and its tabs only, and would now
--    open every sub-page too.
-- 4. Responsibilities on such a page move to the project, with their
--    history. Of one person's active ones in a project, the project's own
--    stays active, else the earliest; every other one moves ended, with a
--    `responsibility_ended` row (actor: the project's owner), so its text
--    stays readable in the project's history.
-- 5. Owner. Every page's owner becomes its project's owner, so account
--    deletion (8.10), which deletes owned folders, never takes pages out of a
--    project that survives. Two triggers keep it so for every later write,
--    the old instance's included: a page takes its project's owner on insert
--    and on any project or owner change, and a root's new owner reaches its
--    pages.
-- 6. Tasks gain `project_id` (the folder's project, kept by a trigger and a
--    foreign key) and the assignee must be a member of the project.
-- 7. Membership rows on a page that is not a project root stay, unread:
--    every read joins memberships to the project, the trigger below refuses
--    new ones, and a page promoted to a project later drops them before it
--    copies its people. A leaver's go with the project membership. Step 9
--    reads their `shelf_name` for people still on the project; 0065
--    deletes them.
-- 8. The deploy overlap. The old instance keeps serving until this one is
--    healthy. A task it inserts gets its project from the trigger. A
--    membership row it writes on a page that is not a project root (its
--    sub-page and tab copies) is dropped when the person is already on the
--    project and refused otherwise. An invite it writes on such a page is
--    refused (`invites_on_project_root`), and the new server invalidates
--    any invite on such a page when it is accepted rather than widen it to
--    the project. A page it creates or moves takes its project's owner. A
--    move into a project with other people is refused
--    (`folders_move_keeps_people`), and a page it promotes to the Library
--    drops its unread rows and takes its old project's people
--    (`folders_root_takes_project_people`). So nothing it writes widens
--    access or leaves a page to its creator. Its reads join memberships to
--    the page itself: on tabs and sub-pages it answers from the rows 0062
--    left there. Someone the new server adds to a project gets 404 there
--    (closed); someone it removes loses those rows too (runRClean), and a
--    preset it changes is written to them as well (changeMemberAccess).
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
CREATE TEMP TABLE s8_resp_before ON COMMIT DROP AS
  SELECT r.id, r.folder_id, r.ended_at FROM folder_responsibilities r;
--> statement-breakpoint
CREATE TEMP TABLE s8_resp_history_before ON COMMIT DROP AS
  SELECT h.id, h.folder_id, h.responsibility_id FROM folder_responsibility_history h;
--> statement-breakpoint
CREATE TEMP TABLE s8_invites_before ON COMMIT DROP AS
  SELECT i.id, i.status FROM invites i;
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
       AND ((f.deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM folders r WHERE r.id = f.project_id AND r.deleted_at IS NOT NULL))
            OR EXISTS (SELECT m.user_id FROM folder_members m WHERE m.folder_id = f.id
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
  RAISE NOTICE 'step 8: % pages whose people differed from their project''s, or whose project was in Trash, became projects: %',
    (SELECT count(*) FROM s8_split),
    (SELECT string_agg(id::text, ', ' ORDER BY id) FROM s8_split);
END
$$;
--> statement-breakpoint
UPDATE page_blocks b SET kind = 'folder_ref'
  FROM s8_split s
 WHERE b.kind = 'page' AND b.ref_folder_id = s.id;
--> statement-breakpoint
-- A project the split touched (a new one, or the one it left) that holds
-- discussions and no Discussion tab gets one, last in its tab row and
-- trashed with its root if the root is trashed (0061's rule).
CREATE TEMP TABLE s8_new_tabs ON COMMIT DROP AS
  SELECT gen_random_uuid() AS id, r.id AS project_id, r.owner_id, r.deleted_at,
         CASE WHEN r.deleted_at IS NOT NULL THEN COALESCE(r.trashed_with_folder_id, r.id) END AS trashed_with,
         migration_util.key_after((SELECT max(t.tab_position COLLATE "C") FROM folders t
                                    WHERE t.project_id = r.id AND t.tab_position IS NOT NULL)) AS tab_position
    FROM folders r
   WHERE r.id = r.project_id
     AND (r.id IN (SELECT id FROM s8_split) OR r.id IN (SELECT old_project FROM s8_split))
     AND EXISTS (SELECT 1 FROM discussions d JOIN folders df ON df.id = d.folder_id
                  WHERE df.project_id = r.id)
     AND NOT EXISTS (SELECT 1 FROM folders t WHERE t.project_id = r.id AND t.kind = 'discussion');
--> statement-breakpoint
INSERT INTO folders (id, owner_id, name, created_at, deleted_at, trashed_with_folder_id,
                     project_id, kind, tab_position)
SELECT n.id, n.owner_id, 'Discussion', now(), n.deleted_at, n.trashed_with, n.project_id, 'discussion', n.tab_position
  FROM s8_new_tabs n;
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
   WHERE i.status = 'pending'
     AND (f.id <> f.project_id
          OR EXISTS (SELECT 1 FROM folders c WHERE c.project_id = f.id AND c.parent_folder_id IS NOT NULL));
--> statement-breakpoint
UPDATE invites SET status = 'invalidated', responded_at = now()
 WHERE id IN (SELECT id FROM s8_invites);
--> statement-breakpoint
-- 4. Responsibilities. Every document on a page moves to its project. Of
-- the active ones for one person in one project, the project's own stays
-- active, else the earliest; every other one moves ended.
CREATE TEMP TABLE s8_resp ON COMMIT DROP AS
  SELECT r.id, r.folder_id, f.project_id, r.member_id, r.ended_at,
         row_number() OVER (PARTITION BY f.project_id, r.member_id, (r.ended_at IS NULL)
                            ORDER BY r.created_at, r.id) AS nth
    FROM folder_responsibilities r
    JOIN folders f ON f.id = r.folder_id AND f.id <> f.project_id;
--> statement-breakpoint
CREATE TEMP TABLE s8_resp_move ON COMMIT DROP AS
  SELECT s.id, s.folder_id, s.project_id, s.member_id,
         (s.ended_at IS NULL
          AND (s.nth > 1 OR EXISTS (SELECT 1 FROM folder_responsibilities p
                                     WHERE p.folder_id = s.project_id AND p.member_id = s.member_id
                                       AND p.ended_at IS NULL))) AS ends
    FROM s8_resp s;
--> statement-breakpoint
UPDATE folder_responsibilities r
   SET folder_id = s.project_id,
       ended_at = CASE WHEN s.ends THEN now() ELSE r.ended_at END
  FROM s8_resp_move s WHERE s.id = r.id;
--> statement-breakpoint
UPDATE folder_responsibility_history h SET folder_id = s.project_id
  FROM s8_resp_move s WHERE s.id = h.responsibility_id;
--> statement-breakpoint
INSERT INTO folder_responsibility_history (folder_id, member_id, responsibility_id, transition, actor_id)
SELECT s.project_id, s.member_id, s.id, 'responsibility_ended', p.owner_id
  FROM s8_resp_move s JOIN folders p ON p.id = s.project_id
 WHERE s.ends;
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
-- An invite names a project root: one on any other page would add the
-- invitee to the whole project, which its inviter meant for one page.
CREATE FUNCTION invites_on_project_root() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.folder_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM folders f WHERE f.id = NEW.folder_id AND f.project_id = f.id) THEN
    RAISE EXCEPTION 'step 8: an invite names a project, not page %', NEW.folder_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invites_on_project_root';
  END IF;
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER invites_on_project_root BEFORE INSERT ON invites
  FOR EACH ROW EXECUTE FUNCTION invites_on_project_root();
--> statement-breakpoint
-- 5, kept: a page has its project's owner, whoever writes it (the old
-- instance's create, duplicate, import and move included). A row-level
-- trigger cannot rely on the order of a multi-row UPDATE, so a root's new
-- owner is carried to its pages after the root row changes, and the page
-- rows then read it.
CREATE FUNCTION folders_owner_from_project() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  owner uuid;
BEGIN
  IF NEW.project_id IS NOT NULL AND NEW.id <> NEW.project_id THEN
    SELECT p.owner_id INTO owner FROM folders p WHERE p.id = NEW.project_id;
    IF owner IS NOT NULL THEN
      NEW.owner_id := owner;
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER folders_owner_from_project BEFORE INSERT OR UPDATE OF project_id, owner_id ON folders
  FOR EACH ROW EXECUTE FUNCTION folders_owner_from_project();
--> statement-breakpoint
CREATE FUNCTION folders_project_owner_to_pages() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  UPDATE folders SET owner_id = NEW.owner_id
   WHERE project_id = NEW.id AND id <> NEW.id AND owner_id <> NEW.owner_id;
  RETURN NULL;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER folders_project_owner_to_pages AFTER UPDATE OF owner_id ON folders
  FOR EACH ROW WHEN (NEW.id = NEW.project_id AND OLD.owner_id IS DISTINCT FROM NEW.owner_id)
  EXECUTE FUNCTION folders_project_owner_to_pages();
--> statement-breakpoint
-- 8, moves: a page or a project root that moves into another project must
-- find the same owner and the same people at the same presets there, or its
-- people would change (the new moveFolder's samePeople, kept for every
-- writer, the old instance's move included). A sub-page carried by its
-- parent's move (ON UPDATE CASCADE, its own parent unchanged) was checked
-- on that parent. A page becoming a root is the next trigger's.
CREATE FUNCTION folders_move_keeps_people() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD.project_id IS NOT DISTINCT FROM NEW.project_id OR NEW.project_id = NEW.id
     OR (NEW.parent_folder_id IS NOT NULL AND NEW.parent_folder_id IS NOT DISTINCT FROM OLD.parent_folder_id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM folders a JOIN folders b ON b.id = NEW.project_id
              WHERE a.id = OLD.project_id AND a.owner_id IS DISTINCT FROM b.owner_id)
     OR EXISTS ((SELECT user_id, access FROM folder_members WHERE folder_id = OLD.project_id
                 EXCEPT SELECT user_id, access FROM folder_members WHERE folder_id = NEW.project_id)
                UNION ALL
                (SELECT user_id, access FROM folder_members WHERE folder_id = NEW.project_id
                 EXCEPT SELECT user_id, access FROM folder_members WHERE folder_id = OLD.project_id)) THEN
    RAISE EXCEPTION 'step 8: page % cannot move to a project with other people', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'folders_move_keeps_people';
  END IF;
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER folders_move_keeps_people BEFORE UPDATE OF project_id ON folders
  FOR EACH ROW EXECUTE FUNCTION folders_move_keeps_people();
--> statement-breakpoint
-- 8, promotions: a page that becomes a project root keeps the people who
-- saw it, its old project's, at their presets; the rows 0062 left unread on
-- it (old presets, people since removed) go first. promoteToProjects does
-- the same with history, and sets `dana.promoting` so this stays out of its
-- way; this covers every other writer (the old instance's bare
-- `project_id = id`).
CREATE FUNCTION folders_root_takes_project_people() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_setting('dana.promoting', true) IS NOT DISTINCT FROM 'on' THEN
    RETURN NULL;
  END IF;
  DELETE FROM folder_members WHERE folder_id = NEW.id;
  INSERT INTO folder_members (folder_id, user_id, access, can_edit_own_responsibilities, created_at)
  SELECT NEW.id, m.user_id, m.access, m.can_edit_own_responsibilities, m.created_at
    FROM folder_members m WHERE m.folder_id = OLD.project_id;
  RETURN NULL;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER folders_root_takes_project_people AFTER UPDATE OF project_id ON folders
  FOR EACH ROW WHEN (OLD.project_id <> OLD.id AND NEW.project_id = NEW.id)
  EXECUTE FUNCTION folders_root_takes_project_people();
--> statement-breakpoint
-- Invariants.
DO $$
DECLARE
  bad text;
  n integer;
BEGIN
  -- Everyone sees exactly the pages they saw (a new Discussion tab is new).
  SELECT (d.user_id::text || ' ' || d.folder_id::text) INTO bad FROM (
    (SELECT user_id, folder_id FROM s8_vis_before
     EXCEPT
     SELECT m.user_id, f.id FROM folders f JOIN folder_members m ON m.folder_id = f.project_id)
    UNION ALL
    (SELECT m.user_id, f.id FROM folders f JOIN folder_members m ON m.folder_id = f.project_id
      WHERE f.id NOT IN (SELECT id FROM s8_new_tabs)
     EXCEPT
     SELECT user_id, folder_id FROM s8_vis_before)
  ) d
  LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: visibility changed %', bad;
  END IF;

  -- No membership row was deleted (with the check below, none was added).
  IF (SELECT count(*) FROM s8_vis_before) <> (SELECT count(*) FROM folder_members) THEN
    RAISE EXCEPTION 'step 8: membership count changed';
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
  -- Every project root keeps its own owner.
  SELECT f.id::text INTO bad FROM folders f JOIN s8_folders_before b ON b.id = f.id
   WHERE f.id = f.project_id AND f.owner_id <> b.owner_id LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: project owner changed %', bad;
  END IF;

  -- Folders: only the split pages moved, only project and owner changed
  -- elsewhere, and a page's project is its parent's.
  SELECT f.id::text INTO bad FROM folders f
    LEFT JOIN s8_folders_before b ON b.id = f.id
    LEFT JOIN s8_split s ON s.id = f.id
   WHERE f.id NOT IN (SELECT id FROM s8_new_tabs)
     AND (b.id IS NULL
          OR b.rest IS DISTINCT FROM (to_jsonb(f) - 'parent_folder_id' - 'child_position' - 'project_id' - 'tab_position' - 'owner_id')
          OR (s.id IS NULL AND f.parent_folder_id IS DISTINCT FROM b.parent_folder_id)
          OR (s.id IS NOT NULL AND (f.parent_folder_id IS NOT NULL OR f.project_id <> f.id)))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: folder changed %', bad;
  END IF;
  SELECT count(*) INTO n FROM s8_folders_before;
  IF n + (SELECT count(*) FROM s8_new_tabs) <> (SELECT count(*) FROM folders) THEN
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

  -- A project the split touched that holds discussions has a Discussion tab.
  SELECT df.project_id::text INTO bad FROM discussions d JOIN folders df ON df.id = d.folder_id
   WHERE (df.project_id IN (SELECT id FROM s8_split) OR df.project_id IN (SELECT old_project FROM s8_split))
     AND NOT EXISTS (SELECT 1 FROM folders t WHERE t.project_id = df.project_id AND t.kind = 'discussion')
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: discussions without a tab %', bad;
  END IF;

  -- Invites: every row stays, and only the planned ones changed, to
  -- invalidated.
  SELECT b.id::text INTO bad FROM s8_invites_before b LEFT JOIN invites i ON i.id = b.id
   WHERE i.id IS NULL
      OR (b.id IN (SELECT id FROM s8_invites) AND i.status <> 'invalidated')
      OR (b.id NOT IN (SELECT id FROM s8_invites) AND i.status IS DISTINCT FROM b.status)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: invite changed %', bad;
  END IF;
  IF (SELECT count(*) FROM s8_invites_before) <> (SELECT count(*) FROM invites) THEN
    RAISE EXCEPTION 'step 8: invite count changed';
  END IF;
  SELECT i.id::text INTO bad FROM invites i JOIN folders f ON f.id = i.folder_id
   WHERE i.status = 'pending'
     AND (f.id <> f.project_id
          OR EXISTS (SELECT 1 FROM folders c WHERE c.project_id = f.id AND c.parent_folder_id IS NOT NULL))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: pending invite that would widen %', bad;
  END IF;

  -- Responsibilities: every document stays; the planned ones moved to their
  -- project (ended where planned), the rest are untouched, none is left on
  -- a page.
  SELECT b.id::text INTO bad FROM s8_resp_before b
    LEFT JOIN folder_responsibilities r ON r.id = b.id
    LEFT JOIN s8_resp_move m ON m.id = b.id
   WHERE r.id IS NULL
      OR (m.id IS NULL AND (r.folder_id <> b.folder_id OR r.ended_at IS DISTINCT FROM b.ended_at))
      OR (m.id IS NOT NULL AND (r.folder_id <> m.project_id
                                OR (m.ends AND (b.ended_at IS NOT NULL OR r.ended_at IS NULL))
                                OR (NOT m.ends AND r.ended_at IS DISTINCT FROM b.ended_at)))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: responsibility changed %', bad;
  END IF;
  IF (SELECT count(*) FROM s8_resp_before) <> (SELECT count(*) FROM folder_responsibilities) THEN
    RAISE EXCEPTION 'step 8: responsibility count changed';
  END IF;
  SELECT r.id::text INTO bad FROM folder_responsibilities r JOIN folders f ON f.id = r.folder_id
   WHERE f.id <> f.project_id LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: responsibility left on a page %', bad;
  END IF;
  -- None moved from a live page onto a root in Trash, which the purge
  -- deletes while the page lives on.
  SELECT m.id::text INTO bad FROM s8_resp_move m
    JOIN folders o ON o.id = m.folder_id
    JOIN folders p ON p.id = m.project_id
   WHERE o.deleted_at IS NULL AND p.deleted_at IS NOT NULL LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: responsibility moved into Trash %', bad;
  END IF;

  -- Responsibility history: every row stays; a row moved only to its
  -- document's project (with no document, its page's project); the only new
  -- rows are the planned endings.
  SELECT b.id::text INTO bad FROM s8_resp_history_before b
    LEFT JOIN folder_responsibility_history h ON h.id = b.id
    LEFT JOIN s8_resp_move m ON m.id = b.responsibility_id
    LEFT JOIN folders o ON o.id = b.folder_id
   WHERE h.id IS NULL
      OR (h.folder_id <> b.folder_id
          AND NOT (m.id IS NOT NULL AND h.folder_id = m.project_id)
          AND NOT (b.responsibility_id IS NULL AND o.id <> o.project_id AND h.folder_id = o.project_id))
      OR (m.id IS NOT NULL AND h.folder_id <> m.project_id)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: responsibility history changed %', bad;
  END IF;
  SELECT h.id::text INTO bad FROM folder_responsibility_history h
   WHERE NOT EXISTS (SELECT 1 FROM s8_resp_history_before b WHERE b.id = h.id)
     AND NOT (h.transition = 'responsibility_ended'
              AND EXISTS (SELECT 1 FROM s8_resp_move m WHERE m.id = h.responsibility_id AND m.ends
                            AND m.project_id = h.folder_id))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 8: responsibility history added %', bad;
  END IF;
  IF (SELECT count(*) FROM folder_responsibility_history)
     <> (SELECT count(*) FROM s8_resp_history_before) + (SELECT count(*) FROM s8_resp_move WHERE ends) THEN
    RAISE EXCEPTION 'step 8: responsibility history count changed';
  END IF;

  SELECT count(*) INTO n FROM folder_access_history;
  IF n - (SELECT h FROM s8_history_count) <> (SELECT count(*) FROM s8_preset) THEN
    RAISE EXCEPTION 'step 8: preset history rows %', n;
  END IF;

  RAISE NOTICE 'step 8: % presets on pages gave way to the project''s: %',
    (SELECT count(*) FROM s8_preset),
    (SELECT string_agg(folder_id::text || '/' || user_id::text || ' ' || page_access || '->' || project_access,
                       ', ' ORDER BY folder_id, user_id) FROM s8_preset);
  RAISE NOTICE 'step 8: % pending invites that would now widen were invalidated: %',
    (SELECT count(*) FROM s8_invites),
    (SELECT string_agg(id::text, ', ' ORDER BY id) FROM s8_invites);
  RAISE NOTICE 'step 8: % Responsibilities moved to their project, % of them ended (one already active)',
    (SELECT count(*) FROM s8_resp_move),
    (SELECT count(*) FROM s8_resp_move WHERE ends);
  RAISE NOTICE 'step 8: % Discussion tabs added: %',
    (SELECT count(*) FROM s8_new_tabs),
    (SELECT string_agg(project_id::text, ', ' ORDER BY project_id) FROM s8_new_tabs);
END
$$;
