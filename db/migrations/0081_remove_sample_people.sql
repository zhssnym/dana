-- 0081: the sample workspace is gone (#636). Remove the three sample people and what
-- they wrote in pages that people kept, then the sample register.
-- A sample thread that holds real writing goes to the page owner. Sample posts are dated
-- before their author's account, because the sample was written when the account was made.
UPDATE discussions d SET created_by = f.owner_id
  FROM folders f
  WHERE f.id = d.folder_id
    AND d.created_by = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[])
    AND EXISTS (SELECT 1 FROM comments c JOIN users u ON u.id = c.author_id
                 WHERE c.discussion_id = d.id AND c.created_at >= u.created_at
                   AND c.author_id <> ALL('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]));
--> statement-breakpoint
DELETE FROM discussions WHERE created_by = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]);
--> statement-breakpoint
UPDATE discussions SET current_outcome_id = NULL
  WHERE current_outcome_id IN (SELECT o.id FROM discussion_outcomes o
                                WHERE o.actor_id = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]));
--> statement-breakpoint
DELETE FROM discussion_outcomes WHERE actor_id = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]);
--> statement-breakpoint
UPDATE discussions SET resolved_by = NULL WHERE resolved_by = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]);
--> statement-breakpoint
DELETE FROM comments WHERE author_id = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]);
--> statement-breakpoint
UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]);
--> statement-breakpoint
UPDATE tasks
  SET assignee_ids = ARRAY(SELECT a FROM unnest(assignee_ids) AS a
                            WHERE a <> ALL('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]))
  WHERE assignee_ids && '{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[];
--> statement-breakpoint
DELETE FROM folder_access_history WHERE member_id = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]);
--> statement-breakpoint
DELETE FROM folder_responsibility_history WHERE member_id = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]);
--> statement-breakpoint
DELETE FROM folder_responsibilities WHERE member_id = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]);
--> statement-breakpoint
-- Sample pages handed to a sample person by an account deletion before that was fixed.
DELETE FROM folders WHERE owner_id = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]);
--> statement-breakpoint
-- Any other row that names a sample person stops this migration on its foreign key.
DELETE FROM users WHERE id = ANY('{5a3b1e00-0000-4000-8000-00000000d001,5a3b1e00-0000-4000-8000-00000000d002,5a3b1e00-0000-4000-8000-00000000d003}'::uuid[]);
--> statement-breakpoint
DROP TABLE sample_objects;
