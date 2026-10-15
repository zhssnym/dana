-- #671 / PR #709: READ ONLY baseline of the restored, isolated 0091 database.
-- Run this exact query BEFORE applying 0092-0096, then run it again AFTER.
-- Compare row_count and content_digest for every table; all must match.
-- Only the new Facet columns are excluded from the hashes.
-- This intentionally returns digests rather than private row content.
-- NEVER run a migration against production as part of this rehearsal.

SELECT current_database() AS connected_database;

SELECT * FROM (
  SELECT 'folders' AS table_name, count(*) AS row_count,
         md5(coalesce(string_agg(md5((to_jsonb(x) - 'containing_facet_id')::text), '' ORDER BY x.id), '')) AS content_digest
    FROM folders x
  UNION ALL
  SELECT 'tasks' AS table_name, count(*) AS row_count,
         md5(coalesce(string_agg(md5((to_jsonb(x) - 'page_facet_id')::text), '' ORDER BY x.id), '')) AS content_digest
    FROM tasks x
  UNION ALL
  SELECT 'page_blocks' AS table_name, count(*) AS row_count,
         md5(coalesce(string_agg(md5((to_jsonb(x) - 'page_facet_id')::text), '' ORDER BY x.id), '')) AS content_digest
    FROM page_blocks x
  UNION ALL
  SELECT 'page_document_receipts' AS table_name, count(*) AS row_count,
         md5(coalesce(string_agg(md5((to_jsonb(x) - 'page_facet_id')::text), '' ORDER BY x.actor_id, x.folder_id, x.mutation_id), '')) AS content_digest
    FROM page_document_receipts x
  UNION ALL
  SELECT 'files' AS table_name, count(*) AS row_count,
         md5(coalesce(string_agg(md5((to_jsonb(x))::text), '' ORDER BY x.id), '')) AS content_digest
    FROM files x
  UNION ALL
  SELECT 'folder_members' AS table_name, count(*) AS row_count,
         md5(coalesce(string_agg(md5((to_jsonb(x))::text), '' ORDER BY x.folder_id, x.user_id), '')) AS content_digest
    FROM folder_members x
  UNION ALL
  SELECT 'folder_facets' AS table_name, count(*) AS row_count,
         md5(coalesce(string_agg(md5((to_jsonb(x))::text), '' ORDER BY x.id), '')) AS content_digest
    FROM folder_facets x
  UNION ALL
  SELECT 'profile_doc_roots' AS table_name, count(*) AS row_count,
         md5(coalesce(string_agg(md5((to_jsonb(x))::text), '' ORDER BY x.root_folder_id), '')) AS content_digest
    FROM profile_doc_roots x
  UNION ALL
  SELECT 'profile_doc_grants' AS table_name, count(*) AS row_count,
         md5(coalesce(string_agg(md5((to_jsonb(x))::text), '' ORDER BY x.root_folder_id, x.user_id), '')) AS content_digest
    FROM profile_doc_grants x
) fingerprints ORDER BY table_name;
