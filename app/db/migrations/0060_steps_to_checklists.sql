-- 0060: a task's steps become checklist items in its body (step 6).
--
-- A task is a leaf: its subtasks are the checklist items of its own document,
-- not rows of a second table. Every `steps` row becomes a `checklist` block of
-- its task, with the same id, text (`title`) and tick (`done`), in 4.6's
-- `(position, id)` order, after the task's last existing block. That is where
-- the subtask list was drawn (below the writing), and it means no existing
-- block's key moves.
--
-- 1. `migration_util.key_after(k)`: 4.5's `keyBetween(k, null)` in plpgsql,
--    for this migration and 0061. It compares characters by code
--    (`ascii`, `position` over the digit string), never by the database's
--    collation. The schema stays until the contract migration drops it.
-- 2. A task with `notes` and no blocks gets its document from `notes` on
--    first read (`materializeNotesLocked`). Appending to it would make it
--    "have blocks" and the notes would never be read again. So, only for
--    tasks with steps, the notes are materialized first with 0031's own loop.
-- 3. Any NULL `page_position` among those tasks' blocks is keyed after the
--    largest key, in reader order, so the append lands last.
-- 4. The append. Trashed tasks are included (they may be restored). The
--    `steps` table is not touched and is read by nothing after this.
-- 5. `tasks.notes` is the plain-text projection of the body, which now skips
--    checklist blocks (the workflow round trip carries them as `steps`).
--    Rewritten for every task that holds a checklist block.
-- 6. Invariants. Any mismatch raises `step 6: <check> <id>`, which rolls back
--    every pending migration with this one.
--
-- Forward only. Nothing is dropped.
CREATE SCHEMA migration_util;
--> statement-breakpoint
CREATE FUNCTION migration_util.key_after(k text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  digits constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  h integer;
  len integer;
  body text[];
  i integer;
  idx integer;
  carry boolean := true;
BEGIN
  IF k IS NULL THEN
    RETURN 'a0';
  END IF;
  h := ascii(substr(k, 1, 1));
  IF h BETWEEN 97 AND 122 THEN
    len := h - 97 + 2;
  ELSIF h BETWEEN 65 AND 90 THEN
    len := 90 - h + 2;
  ELSE
    RAISE EXCEPTION 'step 6: invalid order key %', k;
  END IF;
  IF char_length(k) < len THEN
    RAISE EXCEPTION 'step 6: invalid order key %', k;
  END IF;
  body := string_to_array(substr(k, 2, len - 1), NULL);
  i := len - 1;
  WHILE carry AND i >= 1 LOOP
    idx := position(body[i] IN digits);
    IF idx = 0 THEN
      RAISE EXCEPTION 'step 6: invalid order key %', k;
    ELSIF idx = 62 THEN
      body[i] := '0';
    ELSE
      body[i] := substr(digits, idx + 1, 1);
      carry := false;
    END IF;
    i := i - 1;
  END LOOP;
  IF NOT carry THEN
    RETURN chr(h) || array_to_string(body, '');
  END IF;
  IF h = 90 THEN
    RETURN 'a0';
  END IF;
  IF h = 122 THEN
    RAISE EXCEPTION 'step 6: no room above order key %', k;
  END IF;
  IF h + 1 > 97 THEN
    body := body || '0'::text;
  ELSE
    body := body[1:array_length(body, 1) - 1];
  END IF;
  RETURN chr(h + 1) || COALESCE(array_to_string(body, ''), '');
END
$fn$;
--> statement-breakpoint
DO $$
DECLARE
  bad text;
BEGIN
  SELECT s.id::text INTO bad FROM steps s
   WHERE EXISTS (SELECT 1 FROM page_blocks b WHERE b.id = s.id)
      OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = s.id)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 6: id collision %', bad;
  END IF;
END
$$;
--> statement-breakpoint
CREATE TEMP TABLE s6_steps ON COMMIT DROP AS
  SELECT s.id, s.task_id, s.title, s.done,
         row_number() OVER (PARTITION BY s.task_id ORDER BY s.position, s.id) AS rank
    FROM steps s;
--> statement-breakpoint
CREATE TEMP TABLE s6_before ON COMMIT DROP AS
  SELECT b.id, b.task_id, b.page_position, to_jsonb(b) AS whole
    FROM page_blocks b
   WHERE b.task_id IN (SELECT task_id FROM s6_steps);
--> statement-breakpoint
CREATE TEMP TABLE s6_notes ON COMMIT DROP AS
  SELECT t.id AS task_id, t.notes,
         (t.id IN (SELECT task_id FROM s6_steps)
          AND t.notes IS NOT NULL AND t.notes <> ''
          AND NOT EXISTS (SELECT 1 FROM page_blocks b WHERE b.task_id = t.id)) AS materialize
    FROM tasks t;
--> statement-breakpoint
-- 2. 0031's loop, verbatim, over the tasks marked above.
DO $$
DECLARE
  r record;
  rest text;
  piece text;
  win text;
  cut integer;
  nl integer;
  pos integer;
BEGIN
  FOR r IN
    SELECT n.task_id AS id, n.notes FROM s6_notes n WHERE n.materialize ORDER BY n.task_id
  LOOP
    rest := r.notes;
    pos := 0;
    LOOP
      IF char_length(rest) <= 4000 THEN
        piece := rest;
        rest := NULL;
      ELSE
        win := substr(rest, 1, 4001);
        cut := position(E'\n' IN reverse(win));
        IF cut > 0 THEN
          nl := 4002 - cut;
          piece := substr(rest, 1, nl - 1);
          rest := substr(rest, nl + 1);
        ELSE
          piece := substr(rest, 1, 4000);
          rest := substr(rest, 4001);
        END IF;
      END IF;
      INSERT INTO page_blocks (task_id, kind, position, page_position, text)
      VALUES (r.id, 'paragraph', pos,
              'a' || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', pos + 1, 1),
              piece);
      pos := pos + 1;
      EXIT WHEN rest IS NULL;
    END LOOP;
  END LOOP;
END
$$;
--> statement-breakpoint
-- 3 and 4: key stray NULLs, then append the steps, per task.
DO $$
DECLARE
  t record;
  b record;
  s record;
  last_key text;
  last_pos integer;
BEGIN
  FOR t IN SELECT DISTINCT task_id FROM s6_steps ORDER BY task_id LOOP
    SELECT max(page_position COLLATE "C") INTO last_key
      FROM page_blocks WHERE task_id = t.task_id;
    FOR b IN
      SELECT id FROM page_blocks
       WHERE task_id = t.task_id AND page_position IS NULL
       ORDER BY position, updated_at, id
    LOOP
      last_key := migration_util.key_after(last_key);
      UPDATE page_blocks SET page_position = last_key WHERE id = b.id;
    END LOOP;
    SELECT COALESCE(max(position), -1) INTO last_pos
      FROM page_blocks WHERE task_id = t.task_id;
    FOR s IN SELECT * FROM s6_steps WHERE task_id = t.task_id ORDER BY rank LOOP
      last_key := migration_util.key_after(last_key);
      INSERT INTO page_blocks (id, task_id, kind, position, page_position, text, checked)
      VALUES (s.id, s.task_id, 'checklist', last_pos + s.rank, last_key, s.title, s.done);
    END LOOP;
  END LOOP;
END
$$;
--> statement-breakpoint
-- 5. The notes projection, checklists skipped (`notesProjection`).
UPDATE tasks t
   SET notes = p.notes
  FROM (SELECT b.task_id,
               NULLIF(left(string_agg(b.text, E'\n'
                                      ORDER BY b.page_position ASC NULLS LAST, b.position, b.updated_at, b.id)
                             FILTER (WHERE b.kind <> 'checklist' AND b.text IS NOT NULL),
                           10000), '') AS notes
          FROM page_blocks b
         WHERE b.task_id IN (SELECT task_id FROM page_blocks WHERE kind = 'checklist' AND task_id IS NOT NULL)
         GROUP BY b.task_id) p
 WHERE p.task_id = t.id
   AND t.notes IS DISTINCT FROM p.notes;
--> statement-breakpoint
-- 6. Invariants.
DO $$
DECLARE
  bad text;
  n_steps bigint;
  n_blocks bigint;
BEGIN
  SELECT count(*) INTO n_steps FROM steps;
  SELECT count(*) INTO n_blocks FROM page_blocks b
   WHERE b.kind = 'checklist' AND b.id IN (SELECT id FROM steps);
  IF n_steps <> n_blocks THEN
    RAISE EXCEPTION 'step 6: checklist count % <> step count %', n_blocks, n_steps;
  END IF;

  SELECT s.id::text INTO bad FROM steps s
    LEFT JOIN page_blocks b ON b.id = s.id
   WHERE b.id IS NULL
      OR b.task_id IS DISTINCT FROM s.task_id
      OR b.kind <> 'checklist'
      OR b.text IS DISTINCT FROM s.title
      OR b.checked IS DISTINCT FROM s.done
      OR b.folder_id IS NOT NULL OR b.shelf_id IS NOT NULL OR b.facet_id IS NOT NULL
      OR b.section_block_id IS NOT NULL OR b.list_parent_block_id IS NOT NULL
      OR b.rich_content IS NOT NULL OR b.file_id IS NOT NULL OR b.ref_folder_id IS NOT NULL
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 6: step block mismatch %', bad;
  END IF;

  -- Every pre-existing block keeps every column; only a NULL key may gain one.
  SELECT o.id::text INTO bad FROM s6_before o
    LEFT JOIN page_blocks b ON b.id = o.id
   WHERE b.id IS NULL
      OR (to_jsonb(b) - 'page_position') <> (o.whole - 'page_position')
      OR (o.page_position IS NOT NULL AND b.page_position IS DISTINCT FROM o.page_position)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 6: existing block changed %', bad;
  END IF;

  -- Per task: the old blocks in their old order (materialized paragraphs
  -- first where there were none), then the steps in rank order.
  WITH after_order AS (
    SELECT b.task_id, b.id,
           row_number() OVER (PARTITION BY b.task_id
                              ORDER BY b.page_position ASC NULLS LAST, b.position, b.updated_at, b.id) AS ord
      FROM page_blocks b
     WHERE b.task_id IN (SELECT task_id FROM s6_steps)
  ), old_count AS (
    SELECT t.task_id, count(b.id) AS n
      FROM (SELECT DISTINCT task_id FROM s6_steps) t
      LEFT JOIN page_blocks b ON b.task_id = t.task_id AND b.id NOT IN (SELECT id FROM s6_steps)
     GROUP BY t.task_id
  ), before_order AS (
    SELECT o.task_id, o.id,
           row_number() OVER (PARTITION BY o.task_id
                              ORDER BY o.page_position ASC NULLS LAST,
                                       (o.whole->>'position')::integer,
                                       (o.whole->>'updated_at')::timestamptz, o.id) AS ord
      FROM s6_before o
  ), expected AS (
    SELECT s.task_id, s.id, c.n + s.rank AS ord
      FROM s6_steps s JOIN old_count c ON c.task_id = s.task_id
  )
  SELECT e.task_id::text INTO bad
    FROM expected e LEFT JOIN after_order a ON a.id = e.id
   WHERE a.ord IS DISTINCT FROM e.ord
  UNION ALL
  SELECT bo.task_id::text
    FROM before_order bo
    JOIN old_count c ON c.task_id = bo.task_id
    LEFT JOIN after_order a ON a.id = bo.id
   WHERE a.ord IS DISTINCT FROM bo.ord + (c.n - (SELECT count(*) FROM s6_before x WHERE x.task_id = bo.task_id))
  LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 6: order changed on task %', bad;
  END IF;

  -- Materialized notes: the new paragraphs reproduce the old notes exactly,
  -- and the notes column is unchanged.
  SELECT n.task_id::text INTO bad FROM s6_notes n
    JOIN tasks t ON t.id = n.task_id
   WHERE n.materialize
     AND (t.notes IS DISTINCT FROM n.notes
          OR (SELECT string_agg(b.text, E'\n' ORDER BY b.page_position)
                FROM page_blocks b
               WHERE b.task_id = n.task_id AND b.kind = 'paragraph')
             IS DISTINCT FROM n.notes)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 6: materialized notes differ on task %', bad;
  END IF;

  -- A task with no checklist keeps its notes.
  SELECT n.task_id::text INTO bad FROM s6_notes n
    JOIN tasks t ON t.id = n.task_id
   WHERE NOT EXISTS (SELECT 1 FROM page_blocks b WHERE b.task_id = n.task_id AND b.kind = 'checklist')
     AND t.notes IS DISTINCT FROM n.notes
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 6: notes changed on task %', bad;
  END IF;

  SELECT b.id::text INTO bad FROM page_blocks b
   WHERE b.task_id IN (SELECT task_id FROM s6_steps)
     AND (b.page_position IS NULL OR b.page_position !~ '^[0-9A-Za-z]{2,255}$')
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'step 6: bad key on block %', bad;
  END IF;
END
$$;
