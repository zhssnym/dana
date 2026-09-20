-- 0025: the M1-E2 Responsibility document, its revisions and the self-edit
-- grant (issue #230, product authority #209 R5, R7 section O, R10 and the
-- accepted R10B). Forward-only and additive; every constraint and index is
-- named because AC-001 asserts the catalog by name.
--
-- The number 0025 and the journal "when" 1790000000000 were assigned by the
-- coordinator before this file was written, four branches being open at once:
-- 0021 is merged on main, 0022 is #226's, 0023 is #228's and 0024 is #220's.
-- Taking a free-looking prefix instead is how a sibling migration silently
-- stops being applied -- the drizzle migrator applies a file only when its
-- journal "when" exceeds the last applied one, so a higher sibling deploying
-- first skips this file with no error and no tables, and every read that
-- wanted them then throws in production.
--
-- Four things land here.
--
-- 1. folder_members.can_edit_own_responsibilities, R7 section O's explicit
--    narrow grant. It is a boolean on the membership row and not a seventh
--    Access preset, because R7 section O says so in terms: "not a sixth
--    Access level ... it must not silently widen any other Work permission".
--
--    DEFAULT false, which is #230's "default OFF" and is also what makes
--    rejoin correct for free: leaving deletes the membership row, so a person
--    who comes back gets a new row at the column's default rather than an old
--    grant nobody re-made. Nothing else has to remember to clear it.
--
-- 2. folder_responsibilities, the current document -- one row per membership
--    generation, holding the whole canonical payload rather than one row per
--    paragraph. R5 rejected the atomic-statement model in terms ("do not
--    require one database semantic record per bullet/paragraph") and nothing
--    in Dana links to a bullet inside a Responsibility, so there is no
--    identity to give one.
--
--    The uniqueness is partial: one *active* document per (folder, member),
--    where active means ended_at IS NULL. That single index carries the whole
--    of the leave/rejoin rule. Membership ending stamps ended_at, which both
--    stops the row being the current document and frees the pair, so a later
--    rejoin starts from nothing and no old content silently reactivates
--    (R10 "prior Responsibility content does not silently reactivate"). The
--    ended row and its revisions stay exactly where they are, which is the
--    other half of the same rule: history survives the membership it
--    describes.
--
--    content_hash is the sha256 of the canonical payload and is the
--    optimistic-concurrency token, the same discipline and the same
--    documentHash the Folder page transaction already uses. Storing it is
--    what lets a commit recognise its own replay without re-serializing the
--    stored document.
--
-- 3. folder_responsibility_history, the append-only record. Its
--    content-bearing rows are R10's immutable revisions; its two other kinds
--    record the standing changes #230 requires to be history-visible -- the
--    self-edit grant being toggled, and active standing ending with the
--    membership. One table and one ordered read, because the member panel
--    renders them as one list.
--
--    There is no UPDATE and no DELETE against this table anywhere in the
--    application. A correction is a new revision (R10: "Never rewrite/delete
--    the historical revision"), and #230 forbids an ordinary endpoint that
--    deletes one.
--
--    The revision CHECK is written so that no possibly-null value is compared
--    until both sides are known to be present: every clause is IS NULL, IS
--    NOT NULL or an IN over a NOT NULL column, all of which yield a real
--    boolean. A CHECK fails only on FALSE, so a spelling that leaves UNKNOWN
--    admits exactly the row it was written to refuse (backend README, issue
--    #27) -- and AC-001 cannot see the difference, because it asserts a
--    constraint by name and by the columns it mentions and never by what the
--    expression does. The behavioural case that tries the bad row is AC-560.
--
--    folder_id cascades, so a permanent Folder purge takes the Responsibility
--    history with it under the Folder's own retention lifecycle (R10
--    "Retention / purge"). The three user references are RESTRICT, on
--    folder_access_history's precedent and for its reason: 8.10 scrubs an
--    account rather than deleting its row, and SET NULL would forge a
--    different historical actor onto a revision a person actually wrote,
--    which #230 forbids by name.
--
-- 4. invites.responsibility, the optional initial content an authorized
--    inviter may attach to a pending Folder invite. It is jsonb and nullable,
--    and the CHECK ties it to a folder invite: a folderless roster invite
--    grants no Folder standing and can carry no Responsibility for one.
--    Acceptance turns it into the first revision, attributed to the inviter
--    who wrote it and never to the recipient who clicked Accept.
--
-- Nothing here creates a Responsibility document for anybody. R10's "do not
-- fabricate" binds a migration more than it binds anything else: a member who
-- has written nothing has no row, and every count and read below treats that
-- as the empty document rather than as a missing one.
ALTER TABLE folder_members
  ADD COLUMN can_edit_own_responsibilities boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE folder_responsibilities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL,
  member_id uuid NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  current_revision_no integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  ended_at timestamptz,
  ended_by uuid,
  CONSTRAINT folder_responsibilities_pkey PRIMARY KEY (id),
  CONSTRAINT folder_responsibilities_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT folder_responsibilities_member_id_fkey FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT folder_responsibilities_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT folder_responsibilities_ended_by_fkey FOREIGN KEY (ended_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT folder_responsibilities_current_revision_no_check CHECK (current_revision_no > 0),
  CONSTRAINT folder_responsibilities_ended_check CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX folder_responsibilities_folder_id_member_id_active_idx
  ON folder_responsibilities (folder_id, member_id) WHERE ended_at IS NULL;
--> statement-breakpoint
CREATE INDEX folder_responsibilities_member_id_idx
  ON folder_responsibilities (member_id);
--> statement-breakpoint
CREATE TABLE folder_responsibility_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL,
  member_id uuid NOT NULL,
  responsibility_id uuid,
  transition text NOT NULL,
  revision_no integer,
  content jsonb,
  content_hash text,
  actor_id uuid NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folder_responsibility_history_pkey PRIMARY KEY (id),
  CONSTRAINT folder_responsibility_history_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT folder_responsibility_history_member_id_fkey FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT folder_responsibility_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT folder_responsibility_history_responsibility_id_fkey FOREIGN KEY (responsibility_id) REFERENCES folder_responsibilities(id) ON DELETE CASCADE,
  CONSTRAINT folder_responsibility_history_transition_check CHECK (transition IN ('responsibility_created', 'responsibility_updated', 'responsibility_ended', 'self_edit_granted', 'self_edit_revoked')),
  CONSTRAINT folder_responsibility_history_revision_check CHECK ((revision_no IS NULL) = (content IS NULL) AND (content IS NULL) = (content_hash IS NULL) AND (content IS NOT NULL) = (transition IN ('responsibility_created', 'responsibility_updated')) AND (revision_no IS NULL OR revision_no > 0)),
  CONSTRAINT folder_responsibility_history_document_check CHECK (responsibility_id IS NOT NULL OR transition IN ('self_edit_granted', 'self_edit_revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX folder_responsibility_history_revision_no_idx
  ON folder_responsibility_history (responsibility_id, revision_no)
  WHERE revision_no IS NOT NULL;
--> statement-breakpoint
CREATE INDEX folder_responsibility_history_folder_id_effective_at_idx
  ON folder_responsibility_history (folder_id, effective_at);
--> statement-breakpoint
CREATE INDEX folder_responsibility_history_member_id_effective_at_idx
  ON folder_responsibility_history (member_id, effective_at);
--> statement-breakpoint
ALTER TABLE invites ADD COLUMN responsibility jsonb;
--> statement-breakpoint
ALTER TABLE invites
  ADD CONSTRAINT invites_responsibility_requires_folder_check
  CHECK (responsibility IS NULL OR folder_id IS NOT NULL);
