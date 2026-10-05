-- 0023: the M1-E1 Folder Access model (issue #228, product authority #209
-- R8A / R9 / R10B). Forward-only and additive; every constraint and index is
-- named because AC-001 asserts the catalog by name.
--
-- The number 0023 and the journal "when" 1789800000000 were assigned by the
-- coordinator before this file was written, four branches being open at once.
-- 0019 through 0022 are spoken for. Taking a free-looking prefix instead is
-- how a sibling migration silently stops being applied: the drizzle migrator
-- applies a file only when its journal "when" exceeds the last applied one,
-- so a higher sibling deploying first skips this file with no error and no
-- columns (CLAUDE.md reads the installed migrator to prove it).
--
-- Three things land here.
--
-- 1. folder_members.access, the member's one durable Access preset. Six
--    values, R8A's canonical ladder, no more: Manager / Foreman / Lead and
--    the rest are a *scope* problem that M1 has no primitive for, and
--    encoding them as presets is the thing R8A forbids by name.
--
--    The DEFAULT is 'can_view', the most restrictive value, and it is a belt
--    rather than a design. Every INSERT in the application names the preset
--    explicitly, and the guard test beside the suite fails any that does not.
--    An insert that slips past that guard grants the least possible authority
--    rather than the most, which is the only direction an accident about
--    authorization may be allowed to go.
--
--    Existing rows are then initialized to R9 section 11's rule: the folder's
--    owner to full_control, every other member to can_edit. That is the
--    initialization of a model which did not exist before this migration, not
--    a claim about what anybody historically held.
--
-- 2. folder_access_history, R9's structured append-only transition record.
--    It is the authority for "what could this member do then, and who changed
--    it". The generic events table may render a transition and is explicitly
--    not the source of truth (R9 section 12): its short `detail` text cannot
--    carry from/to, actor and kind without being parsed back out of prose.
--
--    previous_access and new_access are both nullable and mean different
--    things: previous NULL is first activation, new NULL is the end of active
--    membership. Both NULL is meaningless, so a CHECK refuses it -- written
--    with IS NOT NULL rather than with a comparison, because a CHECK passes
--    on UNKNOWN and any spelling that compares a possibly-NULL value admits
--    exactly the row it was written to refuse (backend README, issue #27).
--
--    actor_id is nullable only for governed system provenance, which in M1 is
--    this migration's own baseline rows and nothing else; the CHECK ties the
--    permission to that one transition kind rather than leaving it open. A
--    later forced-removal recovery path that genuinely needs system
--    provenance widens the CHECK in its own migration, which is a decision
--    somebody makes rather than a hole somebody finds.
--
--    folder_id cascades: R9 section 15 keeps history for as long as the
--    Folder survives and removes it only under the Folder's own retention
--    rules. member_id and actor_id are RESTRICT, on the tasks_created_by_fkey
--    precedent: 8.10 scrubs an account rather than deleting its row, so the
--    reference survives deletion, and a SET NULL here would forge system
--    provenance onto a transition a person actually made.
--
-- 3. invites.access, the intended preset a pending Folder invite carries
--    (R9 section 5). A folderless roster invite grants no Folder Access and
--    carries none, which the both-or-neither CHECK states in the IS NULL form
--    for the reason above -- IS NULL always yields a real boolean.
--
--    Existing folder invites are backfilled to can_edit, the same value the
--    membership they would create is being initialized to two statements
--    earlier. Every status is backfilled rather than only the pending ones,
--    so the CHECK can be total; the settled rows are history and nothing
--    reads the value on them.
ALTER TABLE folder_members
  ADD COLUMN access text NOT NULL DEFAULT 'can_view';
--> statement-breakpoint
ALTER TABLE folder_members
  ADD CONSTRAINT folder_members_access_check
  CHECK (access IN ('full_control', 'can_edit', 'can_contribute',
                    'assigned_work', 'can_comment', 'can_view'));
--> statement-breakpoint
UPDATE folder_members m
   SET access = 'full_control'
  FROM folders f
 WHERE f.id = m.folder_id AND f.owner_id = m.user_id;
--> statement-breakpoint
UPDATE folder_members m
   SET access = 'can_edit'
  FROM folders f
 WHERE f.id = m.folder_id AND f.owner_id <> m.user_id;
--> statement-breakpoint
CREATE TABLE folder_access_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL,
  member_id uuid NOT NULL,
  previous_access text,
  new_access text,
  actor_id uuid,
  transition text NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folder_access_history_pkey PRIMARY KEY (id),
  CONSTRAINT folder_access_history_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT folder_access_history_member_id_fkey FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT folder_access_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT folder_access_history_previous_access_check CHECK (previous_access IS NULL OR previous_access IN ('full_control', 'can_edit', 'can_contribute', 'assigned_work', 'can_comment', 'can_view')),
  CONSTRAINT folder_access_history_new_access_check CHECK (new_access IS NULL OR new_access IN ('full_control', 'can_edit', 'can_contribute', 'assigned_work', 'can_comment', 'can_view')),
  CONSTRAINT folder_access_history_some_access_check CHECK (previous_access IS NOT NULL OR new_access IS NOT NULL),
  CONSTRAINT folder_access_history_transition_check CHECK (transition IN ('created_owner', 'member_added', 'invite_accepted', 'access_changed', 'self_demoted', 'owner_recovered_full_control', 'member_left', 'member_removed', 'migration_initialized')),
  CONSTRAINT folder_access_history_system_actor_check CHECK (actor_id IS NOT NULL OR transition = 'migration_initialized')
);
--> statement-breakpoint
CREATE INDEX folder_access_history_folder_id_effective_at_idx ON folder_access_history (folder_id, effective_at);
--> statement-breakpoint
CREATE INDEX folder_access_history_member_id_effective_at_idx ON folder_access_history (member_id, effective_at);
--> statement-breakpoint
INSERT INTO folder_access_history (folder_id, member_id, previous_access,
                                   new_access, actor_id, transition)
SELECT m.folder_id, m.user_id, NULL, m.access, NULL, 'migration_initialized'
  FROM folder_members m;
--> statement-breakpoint
ALTER TABLE invites ADD COLUMN access text;
--> statement-breakpoint
UPDATE invites SET access = 'can_edit' WHERE folder_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE invites
  ADD CONSTRAINT invites_access_check
  CHECK (access IS NULL OR access IN ('full_control', 'can_edit',
                                      'can_contribute', 'assigned_work',
                                      'can_comment', 'can_view'));
--> statement-breakpoint
ALTER TABLE invites
  ADD CONSTRAINT invites_access_requires_folder_check
  CHECK ((folder_id IS NULL) = (access IS NULL));
