-- #671 / PR #709: READ ONLY post-migration checks on a restored isolated copy.
-- Run AFTER 0092-0096 and after comparing the before/after fingerprints.
-- Every violation_count must be ZERO. Inspect violations before approving a release.
-- These checks intentionally include archived and trashed Pages in backfill.

SELECT current_database() AS connected_database;

SELECT * FROM (
  SELECT 'missing_legacy_facets' AS check_name, count(*) AS violation_count
    FROM folders f
    LEFT JOIN page_facets pf ON pf.content_folder_id = f.id
   WHERE (f.kind IS DISTINCT FROM 'discussion' OR f.id = f.project_id)
     AND pf.id IS NULL
  UNION ALL
  SELECT 'misowned_legacy_facets', count(*)
    FROM page_facets pf
    JOIN folders f ON f.id = pf.content_folder_id
   WHERE pf.page_id IS DISTINCT FROM
         CASE WHEN f.tab_position IS NOT NULL AND f.id <> f.project_id
              THEN f.project_id ELSE f.id END
  UNION ALL
  SELECT 'legacy_blocks_wrong_facet', count(*)
    FROM page_blocks b
    JOIN page_facets pf ON pf.content_folder_id = b.folder_id
   WHERE b.page_facet_id IS DISTINCT FROM pf.id
  UNION ALL
  SELECT 'legacy_tasks_wrong_facet', count(*)
    FROM tasks t
    JOIN page_facets pf ON pf.content_folder_id = t.folder_id
   WHERE t.page_facet_id IS DISTINCT FROM pf.id
  UNION ALL
  SELECT 'nested_pages_wrong_containing_facet', count(*)
    FROM folders child
    JOIN page_facets pf ON pf.content_folder_id = child.parent_folder_id
   WHERE child.parent_folder_id IS NOT NULL
     AND child.containing_facet_id IS DISTINCT FROM pf.id
  UNION ALL
  SELECT 'archived_legacy_pages_missing_facet', count(*)
    FROM folders f
    LEFT JOIN page_facets pf ON pf.content_folder_id = f.id
   WHERE (f.archived_at IS NOT NULL OR f.deleted_at IS NOT NULL)
     AND (f.kind IS DISTINCT FROM 'discussion' OR f.id = f.project_id)
     AND pf.id IS NULL
  UNION ALL
  SELECT 'unexpected_tombstoned_legacy_facets', count(*)
    FROM page_facets pf
   WHERE pf.content_folder_id IS NOT NULL AND pf.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'missing_content_facet_foreign_key', count(*)
    FROM (
      SELECT page_facet_id FROM page_blocks WHERE page_facet_id IS NOT NULL
      UNION ALL
      SELECT page_facet_id FROM tasks WHERE page_facet_id IS NOT NULL
    ) association
    LEFT JOIN page_facets pf ON pf.id = association.page_facet_id
   WHERE pf.id IS NULL
) checks ORDER BY check_name;

-- These counts are informational and must agree with the expected preflight
-- inventory, not with a hardcoded development-data number.
SELECT
  (SELECT count(*) FROM folders) AS pages_all_states,
  (SELECT count(*) FROM folders WHERE archived_at IS NOT NULL OR deleted_at IS NOT NULL)
    AS archived_or_trashed_pages,
  (SELECT count(*) FROM page_facets WHERE content_folder_id IS NOT NULL) AS legacy_backed_facets,
  (SELECT count(*) FROM page_facets WHERE content_folder_id IS NULL) AS independent_facets,
  (SELECT count(*) FROM page_blocks WHERE folder_id IS NOT NULL) AS folder_blocks,
  (SELECT count(*) FROM tasks WHERE folder_id IS NOT NULL) AS folder_tasks;
