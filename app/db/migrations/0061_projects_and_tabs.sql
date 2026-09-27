-- 0061: every top-level page becomes a project, and its facets become tabs
-- (step 7).
--
-- A project is its root `folders` row; it keeps its id, name, icon and cover.
-- A tab is a root-level `folders` row of the project (`tab_position` set,
-- `parent_folder_id` NULL). The root is the project's first tab. Subpages
-- carry the project's id and no `tab_position`. Nothing is dropped:
-- `folder_facets` and `page_blocks.facet_id` stay, unread, until the contract
-- migration.
--
-- 1. `folders` gains `project_id`, `kind` (doc | work | discussion; NULL only
--    on a root nobody has picked a kind for yet) and `tab_position`.
-- 2. Roots. The root's Main becomes the root itself, kind `work`.
--    - `purpose` and `results` become Doc tabs when shown or holding content
--      (hidden with content becomes shown; nothing is sent to Trash), and on
--      Desk only when holding content.
--    - `consultation` becomes the Discussion tab when shown (never on Desk),
--      or whenever any page of the project has a discussion, trashed ones
--      included.
--    - `shared_blank` becomes a Doc tab, trashed if it was.
--    - A Work facet over an H1 of Main gets no tab: it stores nothing and is
--      a view of a Main section, which stays in Work.
--    - A root holding `page` blocks or child pages gains a Doc tab named
--      `Pages`, right after Work. Its `page` blocks move there in order, its
--      children move under it, and a live child with no home block gets one.
-- 3. The tab order is the order the page drew: a root whose built-ins still
--    sit at their creation keys (main a0, purpose a1, consultation a2,
--    results a3) drew Purpose, Work, Results, Discussion, then the rest in
--    stored order; any other root drew its stored order. Keys are
--    `key_after` chains in that order.
-- 4. Subpages. A `purpose`, `results` or `shared_blank` facet holding content
--    becomes a child Doc page of that subpage (facet id kept), after its last
--    sibling, with a home block at the end of the subpage's document. A
--    subpage is `doc` when it holds a `page` block or no tasks, else `work`.
-- 5. A `private_blank` facet, root or subpage, becomes its own Doc project
--    whose one member is its owner at Full control. It is in Trash only when
--    the facet was: a live one on a trashed page comes out live, because as a
--    project of its own it would no longer come back with that page, and a
--    restore by another member would leave it in Trash to be purged. One whose
--    owner is no longer a member of the page was visible to nobody; it is
--    left where it is (NOTICE), so nobody gains sight of it.
-- 6. Every new page copies its source page's members (Pages tab and tabs:
--    the root's; child Doc pages: the subpage's), personal fields left NULL,
--    each with a `migration_initialized` history row. Step 8 moves members to
--    the project.
-- 7. A file moves with its blocks when every block naming it moved to the
--    same new page and nothing else names it (a page accepts only its own
--    files).
-- 8. Invariants: every old folder, block, file and membership row is
--    unchanged but for the moves named above, and every new page has the
--    name, owner, parent and Trash state its source gives it. Any mismatch raises `step 7: <check> <id>`; all pending
--    migrations roll back together.
-- 9. The deploy overlap. The old instance keeps serving while this one
--    boots. The lock holds its writes until this commits. Afterwards two
--    triggers keep its writes landing: a `folders` insert without a project
--    gets one (a root is its own Work project; a subpage joins its
--    parent's), and a block written into a facet that is now a page lands on
--    that page. A block written into a facet that got no page (an empty
--    Desk Purpose, a hidden empty native, a facet the old instance made after
--    this commit) is refused rather than stored where no page reads it; an
--    orphan private facet's existing rows may still be updated in place. The
--    contract migration drops both triggers.
--
-- Forward only.
LOCK TABLE folders, folder_facets, folder_members, page_blocks, files, discussions
  IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
ALTER TABLE folders
  ADD COLUMN project_id uuid,
  ADD COLUMN kind text,
  ADD COLUMN tab_position text COLLATE "C",
  ADD CONSTRAINT folders_kind_check
    CHECK (kind IS NULL OR kind IN ('doc', 'work', 'discussion')),
  ADD CONSTRAINT folders_tab_position_format_check
    CHECK (tab_position IS NULL OR tab_position ~ '^[0-9A-Za-z]{2,255}$'),
  ADD CONSTRAINT folders_tab_is_root_level_check
    CHECK (tab_position IS NULL OR parent_folder_id IS NULL),
  DROP CONSTRAINT folders_name_length_check,
  ADD CONSTRAINT folders_name_length_check
    CHECK (char_length(name) >= 1 AND char_length(name) <= 120);
--> statement-breakpoint
-- A Result lives on a page now (its Results tab); re-added below, once
-- the blocks have moved.
ALTER TABLE page_blocks DROP CONSTRAINT page_blocks_result_home_check;
--> statement-breakpoint
DO $$
DECLARE
  bad text;
BEGIN
  SELECT ff.id::text INTO bad FROM folder_facets ff
   WHERE EXISTS (SELECT 1 FROM folders f WHERE f.id = ff.id)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: id collision %', bad;
  END IF;
END
$$;
--> statement-breakpoint
-- Snapshots.
CREATE TEMP TABLE s7_folders_before ON COMMIT DROP AS
  SELECT f.id, f.parent_folder_id, f.deleted_at, f.trashed_with_folder_id, f.owner_id,
         to_jsonb(f) - 'parent_folder_id' - 'project_id' - 'kind' - 'tab_position' AS rest
    FROM folders f;
--> statement-breakpoint
CREATE TEMP TABLE s7_files_before ON COMMIT DROP AS
  SELECT fi.id, fi.folder_id, to_jsonb(fi) - 'folder_id' AS rest FROM files fi;
--> statement-breakpoint
CREATE TEMP TABLE s7_blocks_before ON COMMIT DROP AS
  SELECT b.id, b.folder_id, b.facet_id, b.kind, b.section_block_id, b.list_parent_block_id,
         to_jsonb(b) - 'folder_id' - 'facet_id' - 'section_block_id' - 'list_parent_block_id' AS rest
    FROM page_blocks b;
--> statement-breakpoint
CREATE TEMP TABLE s7_rows_before ON COMMIT DROP AS
  SELECT 'task' AS t, md5(to_jsonb(x)::text) AS h FROM tasks x
  UNION ALL SELECT 'discussion', md5(to_jsonb(x)::text) FROM discussions x
  UNION ALL SELECT 'comment', md5(to_jsonb(x)::text) FROM comments x;
--> statement-breakpoint
CREATE TEMP TABLE s7_members_before ON COMMIT DROP AS
  SELECT m.folder_id, m.user_id, m.access, m.role, m.can_edit_own_responsibilities,
         m.created_at, m.shelf_name, m.color
    FROM folder_members m;
--> statement-breakpoint
-- Who could read what: a member reads the page and every facet of it that is
-- shared or their own.
CREATE TEMP TABLE s7_vis_before ON COMMIT DROP AS
  SELECT m.user_id, m.folder_id AS page_id FROM folder_members m
  UNION
  SELECT m.user_id, ff.id FROM folder_facets ff
    JOIN folder_members m ON m.folder_id = ff.folder_id
   WHERE ff.owner_id IS NULL OR ff.owner_id = m.user_id;
--> statement-breakpoint
-- Every row's root, walking up `parent_folder_id`.
CREATE TEMP TABLE s7_root ON COMMIT DROP AS
  WITH RECURSIVE up(id, root, depth) AS (
    SELECT f.id, f.id, 0 FROM folders f WHERE f.parent_folder_id IS NULL
    UNION ALL
    SELECT c.id, up.root, up.depth + 1
      FROM folders c JOIN up ON c.parent_folder_id = up.id
     WHERE up.depth < 25
  )
  SELECT id, root, depth FROM up;
--> statement-breakpoint
DO $$
DECLARE
  bad text;
BEGIN
  SELECT f.id::text INTO bad FROM folders f
   WHERE NOT EXISTS (SELECT 1 FROM s7_root r WHERE r.id = f.id)
      OR (SELECT count(*) FROM s7_root r WHERE r.id = f.id) <> 1
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: page without one root %', bad;
  END IF;
  SELECT r.id::text INTO bad FROM s7_root r WHERE r.depth >= 25 LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: tree deeper than 25 %', bad;
  END IF;
END
$$;
--> statement-breakpoint
UPDATE folders f SET project_id = r.root FROM s7_root r WHERE r.id = f.id;
--> statement-breakpoint
-- Every facet, classified. `becomes`: tab, child, private, h1 or none.
CREATE TEMP TABLE s7_facet ON COMMIT DROP AS
  SELECT ff.id, ff.folder_id, ff.kind, ff.owner_id, ff.display_name, ff.hidden,
         ff.position, ff.created_at, ff.deleted_at,
         (f.parent_folder_id IS NULL) AS is_root,
         f.is_default,
         f.project_id,
         EXISTS (SELECT 1 FROM page_blocks b WHERE b.facet_id = ff.id) AS has_content,
         EXISTS (SELECT 1 FROM discussions d JOIN folders df ON df.id = d.folder_id
                  WHERE df.project_id = f.project_id) AS project_discusses,
         EXISTS (SELECT 1 FROM folder_members m
                  WHERE m.folder_id = ff.folder_id AND m.user_id = ff.owner_id) AS owner_is_member,
         NULL::text AS becomes
    FROM folder_facets ff JOIN folders f ON f.id = ff.folder_id;
--> statement-breakpoint
UPDATE s7_facet SET becomes = CASE
  WHEN kind = 'main' THEN 'none'
  WHEN kind = 'work' THEN 'h1'
  WHEN kind = 'private_blank' THEN CASE WHEN owner_is_member THEN 'private' ELSE 'orphan' END
  WHEN is_root AND kind IN ('purpose', 'results')
       AND (NOT hidden OR has_content) AND (NOT is_default OR has_content) THEN 'tab'
  WHEN is_root AND kind = 'consultation'
       AND ((NOT hidden AND NOT is_default) OR project_discusses) THEN 'tab'
  WHEN is_root AND kind = 'shared_blank' THEN 'tab'
  WHEN NOT is_root AND kind IN ('purpose', 'results', 'shared_blank') AND has_content THEN 'child'
  ELSE 'none'
END;
--> statement-breakpoint
-- The tab row of each root, in drawn order. `source`: root, facet, pages or
-- discussion (a Discussion tab for a project with discussions and no
-- consultation facet at all).
CREATE TEMP TABLE s7_entry (
  project_id uuid NOT NULL,
  page_id uuid NOT NULL,
  source text NOT NULL,
  facet_id uuid,
  kind text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL,
  deleted_at timestamptz,
  trashed_with uuid,
  seq integer,
  tab_position text COLLATE "C"
) ON COMMIT DROP;
--> statement-breakpoint
CREATE TEMP TABLE s7_untouched ON COMMIT DROP AS
  SELECT r.id AS root,
         EXISTS (SELECT 1 FROM folder_facets ff
                  WHERE ff.folder_id = r.id AND ff.kind = 'main' AND ff.deleted_at IS NULL
                    AND ff.position = 'a0')
         AND NOT EXISTS (SELECT 1 FROM folder_facets ff
                          WHERE ff.folder_id = r.id AND ff.deleted_at IS NULL AND ff.owner_id IS NULL
                            AND ((ff.kind = 'main' AND ff.position <> 'a0')
                              OR (ff.kind = 'purpose' AND ff.position <> 'a1')
                              OR (ff.kind = 'consultation' AND ff.position <> 'a2')
                              OR (ff.kind = 'results' AND ff.position <> 'a3'))) AS untouched,
         (SELECT ff.position FROM folder_facets ff
           WHERE ff.folder_id = r.id AND ff.kind = 'main') AS main_position,
         (EXISTS (SELECT 1 FROM page_blocks b WHERE b.folder_id = r.id AND b.kind = 'page')
          OR EXISTS (SELECT 1 FROM folders c WHERE c.parent_folder_id = r.id)) AS needs_pages,
         (NOT EXISTS (SELECT 1 FROM folder_facets ff
                       WHERE ff.folder_id = r.id AND ff.kind = 'consultation')
          AND EXISTS (SELECT 1 FROM discussions d JOIN folders df ON df.id = d.folder_id
                       WHERE df.project_id = r.id)) AS needs_discussion
    FROM folders r WHERE r.parent_folder_id IS NULL;
--> statement-breakpoint
INSERT INTO s7_entry (project_id, page_id, source, facet_id, kind, name, created_at, deleted_at, trashed_with)
SELECT r.id, r.id, 'root', NULL, 'work', r.name, r.created_at, r.deleted_at, r.trashed_with_folder_id
  FROM folders r WHERE r.parent_folder_id IS NULL
UNION ALL
SELECT r.id, s.id, 'facet', s.id,
       CASE WHEN s.kind = 'consultation' THEN 'discussion' ELSE 'doc' END,
       COALESCE(s.display_name, CASE s.kind WHEN 'purpose' THEN 'Purpose'
                                            WHEN 'results' THEN 'Results'
                                            WHEN 'consultation' THEN 'Discussion' END),
       s.created_at,
       COALESCE(s.deleted_at, r.deleted_at),
       CASE WHEN s.deleted_at IS NULL AND r.deleted_at IS NOT NULL
            THEN COALESCE(r.trashed_with_folder_id, r.id) END
  FROM s7_facet s JOIN folders r ON r.id = s.folder_id
 WHERE s.becomes = 'tab'
UNION ALL
SELECT r.id, gen_random_uuid(), 'pages', NULL, 'doc', 'Pages', now(), r.deleted_at,
       CASE WHEN r.deleted_at IS NOT NULL THEN COALESCE(r.trashed_with_folder_id, r.id) END
  FROM folders r JOIN s7_untouched u ON u.root = r.id
 WHERE u.needs_pages
UNION ALL
SELECT r.id, gen_random_uuid(), 'discussion', NULL, 'discussion', 'Discussion', now(), r.deleted_at,
       CASE WHEN r.deleted_at IS NOT NULL THEN COALESCE(r.trashed_with_folder_id, r.id) END
  FROM folders r JOIN s7_untouched u ON u.root = r.id
 WHERE u.needs_discussion;
--> statement-breakpoint
-- The drawn order.
UPDATE s7_entry e SET seq = o.seq
  FROM (
    SELECT e2.page_id,
           row_number() OVER (
             PARTITION BY e2.project_id
             ORDER BY
               -- untouched: the built-ins by rank, then the rest by stored order
               CASE WHEN u.untouched THEN
                 CASE WHEN e2.source = 'root' THEN 1
                      WHEN e2.source = 'pages' THEN 2
                      WHEN e2.source = 'discussion' THEN 4
                      WHEN s.kind = 'purpose' THEN 0
                      WHEN s.kind = 'results' THEN 3
                      WHEN s.kind = 'consultation' THEN 4
                      ELSE 5 END
               ELSE
                 CASE WHEN e2.source = 'discussion' THEN 1 ELSE 0 END
               END,
               (CASE WHEN e2.source IN ('root', 'pages') THEN COALESCE(u.main_position, '')
                     WHEN e2.source = 'discussion' THEN ''
                     ELSE s.position END) COLLATE "C",
               CASE WHEN e2.source = 'pages' THEN 1 ELSE 0 END,
               (CASE WHEN e2.source = 'root' THEN '' ELSE e2.page_id::text END) COLLATE "C"
           ) AS seq
      FROM s7_entry e2
      JOIN s7_untouched u ON u.root = e2.project_id
      LEFT JOIN s7_facet s ON s.id = e2.facet_id
  ) o
 WHERE o.page_id = e.page_id;
--> statement-breakpoint
DO $$
DECLARE
  e record;
  prev uuid := NULL;
  k text := NULL;
BEGIN
  FOR e IN SELECT project_id, page_id FROM s7_entry ORDER BY project_id, seq LOOP
    IF prev IS DISTINCT FROM e.project_id THEN
      k := NULL;
      prev := e.project_id;
    END IF;
    k := migration_util.key_after(k);
    UPDATE s7_entry SET tab_position = k WHERE page_id = e.page_id;
  END LOOP;
END
$$;
--> statement-breakpoint
-- The root rows.
UPDATE folders f SET kind = 'work', tab_position = e.tab_position
  FROM s7_entry e
 WHERE e.source = 'root' AND e.page_id = f.id;
--> statement-breakpoint
-- The tab rows.
INSERT INTO folders (id, owner_id, name, created_at, deleted_at, trashed_with_folder_id,
                     project_id, kind, tab_position)
SELECT e.page_id, r.owner_id, e.name, e.created_at, e.deleted_at, e.trashed_with,
       e.project_id, e.kind, e.tab_position
  FROM s7_entry e JOIN folders r ON r.id = e.project_id
 WHERE e.source <> 'root';
--> statement-breakpoint
-- Child Doc pages of subpages, and private projects.
CREATE TEMP TABLE s7_child ON COMMIT DROP AS
  SELECT s.id, s.folder_id AS parent_id, p.project_id, p.owner_id,
         COALESCE(s.display_name, CASE s.kind WHEN 'purpose' THEN 'Purpose'
                                              WHEN 'results' THEN 'Results' END) AS name,
         s.created_at,
         COALESCE(s.deleted_at, p.deleted_at) AS deleted_at,
         CASE WHEN s.deleted_at IS NULL AND p.deleted_at IS NOT NULL
              THEN COALESCE(p.trashed_with_folder_id, p.id) END AS trashed_with,
         (s.deleted_at IS NULL) AS homed,
         row_number() OVER (PARTITION BY s.folder_id ORDER BY s.position COLLATE "C", s.id) AS rank,
         NULL::text AS child_position
    FROM s7_facet s JOIN folders p ON p.id = s.folder_id
   WHERE s.becomes = 'child';
--> statement-breakpoint
DO $$
DECLARE
  c record;
  k text;
BEGIN
  FOR c IN SELECT id, parent_id FROM s7_child ORDER BY parent_id, rank LOOP
    SELECT max(child_position COLLATE "C") INTO k FROM folders WHERE parent_folder_id = c.parent_id;
    k := migration_util.key_after(k);
    INSERT INTO folders (id, owner_id, name, created_at, deleted_at, trashed_with_folder_id,
                         parent_folder_id, child_position, project_id, kind)
    SELECT s.id, s.owner_id, s.name, s.created_at, s.deleted_at, s.trashed_with,
           s.parent_id, k, s.project_id, 'doc'
      FROM s7_child s WHERE s.id = c.id;
    UPDATE s7_child SET child_position = k WHERE id = c.id;
  END LOOP;
END
$$;
--> statement-breakpoint
INSERT INTO folders (id, owner_id, name, created_at, deleted_at, project_id, kind, tab_position)
SELECT s.id, s.owner_id, s.display_name, s.created_at, s.deleted_at, s.id, 'doc', 'a0'
  FROM s7_facet s
 WHERE s.becomes = 'private';
--> statement-breakpoint
-- Where each old page or facet lives now, for the moves and the checks.
-- `members_from`: the page whose members the new page copies (NULL: the owner
-- alone).
CREATE TEMP TABLE s7_map ON COMMIT DROP AS
  SELECT e.page_id, e.facet_id, e.source, e.project_id AS members_from
    FROM s7_entry e WHERE e.source <> 'root'
  UNION ALL
  SELECT c.id, c.id, 'child', c.parent_id FROM s7_child c
  UNION ALL
  SELECT s.id, s.id, 'private', NULL FROM s7_facet s WHERE s.becomes = 'private';
--> statement-breakpoint
-- Members.
INSERT INTO folder_members (folder_id, user_id, role, access, can_edit_own_responsibilities, created_at)
SELECT m.page_id, fm.user_id, fm.role, fm.access, fm.can_edit_own_responsibilities, fm.created_at
  FROM s7_map m JOIN folder_members fm ON fm.folder_id = m.members_from
 WHERE m.members_from IS NOT NULL;
--> statement-breakpoint
INSERT INTO folder_members (folder_id, user_id, access)
SELECT s.id, s.owner_id, 'full_control'
  FROM s7_facet s WHERE s.becomes = 'private';
--> statement-breakpoint
INSERT INTO folder_access_history (folder_id, member_id, previous_access, new_access, actor_id, transition)
SELECT fm.folder_id, fm.user_id, NULL, fm.access, NULL, 'migration_initialized'
  FROM folder_members fm JOIN s7_map m ON m.page_id = fm.folder_id;
--> statement-breakpoint
-- Blocks. Facet documents move to their page; a root's `page` blocks move to
-- its Pages tab, leaving the Section and list parent they had in Work.
UPDATE page_blocks b SET folder_id = m.page_id, facet_id = NULL
  FROM s7_map m
 WHERE m.facet_id IS NOT NULL AND b.facet_id = m.facet_id;
--> statement-breakpoint
UPDATE page_blocks b SET folder_id = e.page_id, section_block_id = NULL, list_parent_block_id = NULL
  FROM s7_entry e
 WHERE e.source = 'pages' AND b.folder_id = e.project_id AND b.kind = 'page';
--> statement-breakpoint
-- Children of a root move under its Pages tab.
UPDATE folders c SET parent_folder_id = e.page_id
  FROM s7_entry e
 WHERE e.source = 'pages' AND c.parent_folder_id = e.project_id;
--> statement-breakpoint
-- Home blocks: each live child Doc page of a subpage, and each live child of a
-- live root that had none.
CREATE TEMP TABLE s7_home (id uuid NOT NULL, folder_id uuid NOT NULL, ref_folder_id uuid NOT NULL) ON COMMIT DROP;
--> statement-breakpoint
DO $$
DECLARE
  c record;
  k text;
  p integer;
  hid uuid;
BEGIN
  FOR c IN
    SELECT s.id AS child, s.parent_id AS parent, 0 AS grp, lpad(s.rank::text, 10, '0') COLLATE "C" AS ord
      FROM s7_child s WHERE s.homed
    UNION ALL
    SELECT ch.id, ch.parent_folder_id, 1, (COALESCE(ch.child_position, '') || ' ' || ch.id::text) COLLATE "C"
      FROM folders ch
      JOIN s7_entry e ON e.source = 'pages' AND e.page_id = ch.parent_folder_id
      JOIN folders r ON r.id = e.project_id
     WHERE ch.deleted_at IS NULL AND r.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM page_blocks h WHERE h.kind = 'page' AND h.ref_folder_id = ch.id)
    ORDER BY 2, 3, 4
  LOOP
    SELECT max(k2 COLLATE "C") INTO k FROM (
      SELECT page_position AS k2 FROM page_blocks WHERE folder_id = c.parent
      UNION ALL
      SELECT page_position FROM tasks WHERE folder_id = c.parent
    ) keys;
    SELECT COALESCE(max(position), -1) + 1 INTO p FROM page_blocks WHERE folder_id = c.parent;
    hid := gen_random_uuid();
    INSERT INTO page_blocks (id, folder_id, kind, position, page_position, ref_folder_id)
    VALUES (hid, c.parent, 'page', p, migration_util.key_after(k), c.child);
    INSERT INTO s7_home VALUES (hid, c.parent, c.child);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Subpage kinds.
UPDATE folders f SET kind = CASE
    WHEN EXISTS (SELECT 1 FROM page_blocks b WHERE b.folder_id = f.id AND b.kind = 'page')
      OR NOT EXISTS (SELECT 1 FROM tasks t WHERE t.folder_id = f.id)
    THEN 'doc' ELSE 'work' END
 WHERE f.parent_folder_id IS NOT NULL AND f.kind IS NULL;
--> statement-breakpoint
-- Files follow their blocks.
CREATE TEMP TABLE s7_files ON COMMIT DROP AS
  SELECT fi.id, min(b.folder_id::text)::uuid AS page_id
    FROM files fi
    JOIN page_blocks b ON b.file_id = fi.id
   GROUP BY fi.id
  HAVING count(DISTINCT b.folder_id) = 1 AND count(*) = count(b.folder_id)
     AND min(b.folder_id::text)::uuid IN (SELECT page_id FROM s7_map)
     AND NOT EXISTS (SELECT 1 FROM folders f WHERE f.cover_file_id = fi.id)
     AND NOT EXISTS (SELECT 1 FROM comment_files cf WHERE cf.file_id = fi.id)
     AND NOT EXISTS (SELECT 1 FROM user_page_covers uc WHERE uc.file_id = fi.id);
--> statement-breakpoint
UPDATE files fi SET folder_id = s.page_id FROM s7_files s
 WHERE s.id = fi.id AND fi.folder_id IS DISTINCT FROM s.page_id AND fi.folder_id IS NOT NULL;
--> statement-breakpoint
-- The schema, second part.
ALTER TABLE folders
  ALTER COLUMN project_id SET NOT NULL,
  ADD CONSTRAINT folders_id_project_id_key UNIQUE (id, project_id),
  ADD CONSTRAINT folders_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES folders(id) ON DELETE CASCADE,
  DROP CONSTRAINT folders_parent_folder_id_fkey,
  ADD CONSTRAINT folders_parent_same_project_fkey
    FOREIGN KEY (parent_folder_id, project_id) REFERENCES folders(id, project_id)
    ON UPDATE CASCADE ON DELETE SET NULL (parent_folder_id),
  ADD CONSTRAINT folders_project_root_is_tab_check
    CHECK (id <> project_id OR (parent_folder_id IS NULL AND tab_position IS NOT NULL)),
  ADD CONSTRAINT folders_kind_unpicked_is_root_check
    CHECK (kind IS NOT NULL OR id = project_id),
  ADD CONSTRAINT folders_default_is_work_check
    CHECK (NOT is_default OR kind = 'work'),
  ADD CONSTRAINT folders_discussion_is_tab_check
    CHECK (kind IS DISTINCT FROM 'discussion' OR tab_position IS NOT NULL);
--> statement-breakpoint
ALTER TABLE page_blocks
  ADD CONSTRAINT page_blocks_result_home_check
    CHECK (kind <> 'result' OR (folder_id IS NOT NULL AND char_length(text) <= 4000));
--> statement-breakpoint
CREATE UNIQUE INDEX folders_one_discussion_per_project_idx
  ON folders (project_id) WHERE kind = 'discussion' AND deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX folders_project_id_idx ON folders (project_id);
--> statement-breakpoint
CREATE INDEX folders_project_tab_position_idx
  ON folders (project_id, tab_position, id) WHERE tab_position IS NOT NULL;
--> statement-breakpoint
-- Invariants.
DO $$
DECLARE
  bad text;
  n integer;
BEGIN
  -- Every pre-existing block is there, unchanged but for its home, and its
  -- home is exactly the mapped one.
  SELECT o.id::text INTO bad
    FROM s7_blocks_before o
    LEFT JOIN page_blocks b ON b.id = o.id
    LEFT JOIN s7_map fm ON o.facet_id IS NOT NULL AND fm.facet_id = o.facet_id
    LEFT JOIN s7_entry pg ON o.kind = 'page' AND o.folder_id IS NOT NULL
                          AND pg.source = 'pages' AND pg.project_id = o.folder_id
   WHERE b.id IS NULL
      OR (to_jsonb(b) - 'folder_id' - 'facet_id' - 'section_block_id' - 'list_parent_block_id') <> o.rest
      OR b.facet_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM s7_facet s WHERE s.id = b.facet_id AND s.becomes = 'orphan')
      OR b.folder_id IS DISTINCT FROM CASE
           WHEN o.facet_id IS NOT NULL AND fm.page_id IS NOT NULL THEN fm.page_id
           WHEN pg.page_id IS NOT NULL THEN pg.page_id
           ELSE o.folder_id END
      OR (pg.page_id IS NULL AND (b.section_block_id IS DISTINCT FROM o.section_block_id
                                  OR b.list_parent_block_id IS DISTINCT FROM o.list_parent_block_id))
      OR (pg.page_id IS NOT NULL AND (b.section_block_id IS NOT NULL OR b.list_parent_block_id IS NOT NULL))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: block moved wrongly %', bad;
  END IF;
  SELECT b.id::text INTO bad FROM page_blocks b
   WHERE NOT EXISTS (SELECT 1 FROM s7_blocks_before o WHERE o.id = b.id)
     AND NOT EXISTS (SELECT 1 FROM s7_home h WHERE h.id = b.id AND h.folder_id = b.folder_id
                        AND b.kind = 'page' AND b.ref_folder_id = h.ref_folder_id)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: unexpected block %', bad;
  END IF;
  SELECT b.facet_id::text INTO bad FROM page_blocks b
    JOIN s7_facet s ON s.id = b.facet_id
   WHERE s.becomes <> 'orphan'
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: blocks left in facet %', bad;
  END IF;

  -- Tasks, discussions and comments are untouched.
  SELECT count(*) INTO n FROM (
    (SELECT t, h FROM s7_rows_before
     EXCEPT ALL
     SELECT 'task', md5(to_jsonb(x)::text) FROM tasks x
     EXCEPT ALL
     SELECT 'discussion', md5(to_jsonb(x)::text) FROM discussions x
     EXCEPT ALL
     SELECT 'comment', md5(to_jsonb(x)::text) FROM comments x)
  ) diff;
  IF n <> 0 OR (SELECT count(*) FROM s7_rows_before)
                <> (SELECT count(*) FROM tasks) + (SELECT count(*) FROM discussions)
                   + (SELECT count(*) FROM comments) THEN
    RAISE EXCEPTION 'step 7: tasks, discussions or comments changed %', n;
  END IF;

  -- Projects.
  SELECT f.id::text INTO bad FROM folders f
    LEFT JOIN s7_root r ON r.id = f.id
    LEFT JOIN s7_map m ON m.page_id = f.id
   WHERE (r.id IS NOT NULL AND f.project_id <> r.root)
      OR (m.source = 'private' AND f.project_id <> f.id)
      OR (m.source IN ('facet', 'pages', 'discussion', 'child')
          AND f.project_id <> (SELECT e.project_id FROM s7_entry e WHERE e.page_id = f.id
                               UNION ALL SELECT c.project_id FROM s7_child c WHERE c.id = f.id))
      OR (r.id IS NULL AND m.page_id IS NULL)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: wrong project %', bad;
  END IF;

  -- Every old folder is there, unchanged but for one move: a root's child
  -- now sits under that root's Pages tab. No page is left under a root.
  SELECT o.id::text INTO bad
    FROM s7_folders_before o
    LEFT JOIN folders f ON f.id = o.id
    LEFT JOIN s7_entry pg ON pg.source = 'pages' AND pg.project_id = o.parent_folder_id
   WHERE f.id IS NULL
      OR (to_jsonb(f) - 'parent_folder_id' - 'project_id' - 'kind' - 'tab_position') <> o.rest
      OR f.parent_folder_id IS DISTINCT FROM COALESCE(pg.page_id, o.parent_folder_id)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: folder changed %', bad;
  END IF;
  SELECT c.id::text INTO bad FROM folders c JOIN folders r ON r.id = c.parent_folder_id
   WHERE r.id = r.project_id
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: page left under a root %', bad;
  END IF;

  -- Every new page has the name, owner, parent and Trash state its source
  -- gives it, read from the old rows: a tab or child page is in Trash when
  -- its facet was, or with its page when only the page was; a private
  -- project only when its facet was; a Pages or Discussion tab with its root.
  SELECT m.page_id::text INTO bad
    FROM s7_map m
    LEFT JOIN folders f ON f.id = m.page_id
    LEFT JOIN folder_facets ff ON ff.id = m.facet_id
    LEFT JOIN s7_folders_before p ON p.id = COALESCE(ff.folder_id, m.members_from)
   WHERE f.id IS NULL OR p.id IS NULL
      OR f.deleted_at IS DISTINCT FROM CASE
           WHEN m.source = 'private' THEN ff.deleted_at
           WHEN ff.id IS NOT NULL THEN COALESCE(ff.deleted_at, p.deleted_at)
           ELSE p.deleted_at END
      OR f.trashed_with_folder_id IS DISTINCT FROM CASE
           WHEN m.source = 'private' THEN NULL
           WHEN ff.id IS NOT NULL AND ff.deleted_at IS NOT NULL THEN NULL
           WHEN p.deleted_at IS NOT NULL THEN COALESCE(p.trashed_with_folder_id, p.id) END
      OR f.parent_folder_id IS DISTINCT FROM CASE WHEN m.source = 'child' THEN p.id END
      OR f.owner_id IS DISTINCT FROM CASE WHEN m.source = 'private' THEN ff.owner_id ELSE p.owner_id END
      OR f.name IS DISTINCT FROM CASE
           WHEN m.source = 'pages' THEN 'Pages'
           WHEN m.source = 'discussion' THEN 'Discussion'
           ELSE COALESCE(ff.display_name, CASE ff.kind WHEN 'purpose' THEN 'Purpose'
                                                       WHEN 'results' THEN 'Results'
                                                       WHEN 'consultation' THEN 'Discussion' END) END
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: new page %', bad;
  END IF;

  -- Files: only a file of s7_files moved, to the one page every block naming
  -- it now sits on; nothing else about any file changed.
  SELECT o.id::text INTO bad
    FROM s7_files_before o
    LEFT JOIN files fi ON fi.id = o.id
    LEFT JOIN s7_files s ON s.id = o.id
   WHERE fi.id IS NULL
      OR (to_jsonb(fi) - 'folder_id') <> o.rest
      OR fi.folder_id IS DISTINCT FROM CASE
           WHEN s.id IS NOT NULL AND o.folder_id IS NOT NULL THEN s.page_id
           ELSE o.folder_id END
      OR (fi.folder_id IS DISTINCT FROM o.folder_id
          AND (fi.folder_id NOT IN (SELECT page_id FROM s7_map)
               OR EXISTS (SELECT 1 FROM page_blocks b
                           WHERE b.file_id = fi.id AND b.folder_id IS DISTINCT FROM fi.folder_id)))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: file moved wrongly %', bad;
  END IF;
  IF (SELECT count(*) FROM files) <> (SELECT count(*) FROM s7_files_before) THEN
    RAISE EXCEPTION 'step 7: file count changed';
  END IF;

  -- Tab order is the drawn order.
  SELECT a.project_id::text INTO bad FROM (
    SELECT project_id, array_agg(id ORDER BY tab_position, id) AS got
      FROM folders WHERE tab_position IS NOT NULL AND project_id IN (SELECT project_id FROM s7_entry)
     GROUP BY project_id) a
    JOIN (SELECT project_id, array_agg(page_id ORDER BY seq) AS want FROM s7_entry GROUP BY project_id) w
      ON w.project_id = a.project_id
   WHERE a.got <> w.want
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: tab order %', bad;
  END IF;

  -- Members: every new page has exactly its source's people and presets;
  -- a private project has its owner alone, at Full control.
  SELECT m.page_id::text INTO bad FROM s7_map m
   WHERE m.members_from IS NOT NULL
     AND EXISTS (
       (SELECT user_id, access FROM folder_members WHERE folder_id = m.page_id
        EXCEPT SELECT user_id, access FROM s7_members_before WHERE folder_id = m.members_from)
       UNION ALL
       (SELECT user_id, access FROM s7_members_before WHERE folder_id = m.members_from
        EXCEPT SELECT user_id, access FROM folder_members WHERE folder_id = m.page_id))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: members of %', bad;
  END IF;
  SELECT s.id::text INTO bad FROM s7_facet s
   WHERE s.becomes = 'private'
     AND ((SELECT count(*) FROM folder_members m WHERE m.folder_id = s.id) <> 1
          OR NOT EXISTS (SELECT 1 FROM folder_members m WHERE m.folder_id = s.id
                            AND m.user_id = s.owner_id AND m.access = 'full_control'))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: private project members %', bad;
  END IF;
  SELECT (o.folder_id::text || ' ' || o.user_id::text) INTO bad FROM s7_members_before o
    LEFT JOIN folder_members m ON m.folder_id = o.folder_id AND m.user_id = o.user_id
   WHERE m.folder_id IS NULL OR to_jsonb(o) <> jsonb_build_object(
           'folder_id', m.folder_id, 'user_id', m.user_id, 'access', m.access, 'role', m.role,
           'can_edit_own_responsibilities', m.can_edit_own_responsibilities,
           'created_at', m.created_at, 'shelf_name', m.shelf_name, 'color', m.color)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: existing membership changed %', bad;
  END IF;

  -- Visibility: everyone reads exactly what they read before, mapped (a
  -- facet that became a page keeps its id; a Pages or new Discussion tab is
  -- read by whoever read its root).
  SELECT (d.user_id::text || ' ' || d.page_id::text) INTO bad FROM (
    (SELECT v.user_id, v.page_id FROM s7_vis_before v
      WHERE EXISTS (SELECT 1 FROM folders f WHERE f.id = v.page_id)
     UNION
     SELECT v.user_id, e.page_id FROM s7_entry e
       JOIN s7_vis_before v ON v.page_id = e.project_id
      WHERE e.source IN ('pages', 'discussion')
     EXCEPT
     SELECT user_id, folder_id FROM folder_members)
    UNION ALL
    (SELECT user_id, folder_id FROM folder_members
     EXCEPT
     (SELECT v.user_id, v.page_id FROM s7_vis_before v
      UNION
      SELECT v.user_id, e.page_id FROM s7_entry e
        JOIN s7_vis_before v ON v.page_id = e.project_id
       WHERE e.source IN ('pages', 'discussion')))
  ) d
  LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 7: visibility changed %', bad;
  END IF;

  RAISE NOTICE 'step 7: % Work facets over an H1 got no tab',
    (SELECT count(*) FROM s7_facet WHERE becomes = 'h1');
  RAISE NOTICE 'step 7: % hidden facets with content became shown tabs',
    (SELECT count(*) FROM s7_facet WHERE becomes = 'tab' AND hidden AND has_content);
  RAISE NOTICE 'step 7: % private tabs became projects; % left in place (owner not a member)',
    (SELECT count(*) FROM s7_facet WHERE becomes = 'private'),
    (SELECT count(*) FROM s7_facet WHERE becomes = 'orphan');
  RAISE NOTICE 'step 7: % Pages tabs, % child Doc pages, % home blocks, % files moved',
    (SELECT count(*) FROM s7_entry WHERE source = 'pages'),
    (SELECT count(*) FROM s7_child),
    (SELECT count(*) FROM s7_home),
    (SELECT count(*) FROM s7_files);
  RAISE NOTICE 'step 7: % files left behind in their old page',
    (SELECT count(DISTINCT b.file_id) FROM page_blocks b JOIN files fi ON fi.id = b.file_id
      WHERE b.folder_id IN (SELECT page_id FROM s7_map) AND fi.folder_id IS DISTINCT FROM b.folder_id
        AND fi.folder_id IS NOT NULL);
END
$$;
--> statement-breakpoint
-- The deploy overlap (9).
CREATE FUNCTION migration_util.folders_fill_project() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.project_id IS NULL THEN
    IF NEW.parent_folder_id IS NULL THEN
      NEW.project_id := NEW.id;
      NEW.kind := COALESCE(NEW.kind, 'work');
      NEW.tab_position := COALESCE(NEW.tab_position, 'a0');
    ELSE
      SELECT p.project_id INTO NEW.project_id FROM folders p WHERE p.id = NEW.parent_folder_id;
      NEW.kind := COALESCE(NEW.kind, 'doc');
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER folders_fill_project BEFORE INSERT ON folders
  FOR EACH ROW EXECUTE FUNCTION migration_util.folders_fill_project();
--> statement-breakpoint
CREATE FUNCTION migration_util.facet_block_to_page() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.facet_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM folders f WHERE f.id = NEW.facet_id) THEN
      NEW.folder_id := NEW.facet_id;
      NEW.facet_id := NULL;
    ELSIF TG_OP = 'INSERT' OR OLD.facet_id IS DISTINCT FROM NEW.facet_id THEN
      RAISE EXCEPTION 'step 7: facet % has no page; reload Dana', NEW.facet_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'page_blocks_facet_has_page';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER page_blocks_facet_to_page BEFORE INSERT OR UPDATE ON page_blocks
  FOR EACH ROW EXECUTE FUNCTION migration_util.facet_block_to_page();
