-- 0030: Consultation structured input rounds (issue #321, product authority
-- #212 R3 and R4). "Ask for input" inside a Discussion: a round with one of
-- three response shapes -- choose, advice, concerns -- and one current
-- response per participant.
--
-- The number and `when` (1790500000000) were assigned by the 2026-09-24
-- swarm brief: above 0029/1790400000000 and below every later migration of
-- that swarm. The drizzle migrator skips a file whose `when` is not higher
-- than the last applied one, silently (0027's header), so re-check the
-- journal before merging.
--
-- 1. `discussion_input_rounds`. One row is one round of one Discussion.
--    `state` is exactly open | closed and a closed round never reopens: the
--    application has no statement that sets it back, and reopening a
--    Discussion opens nothing. `close_reason` says how it closed -- `closed`
--    by a person (`closed_by`), or `discussion_resolved` when resolving the
--    Discussion closed it in the same transaction (#321 "resolving the parent
--    Discussion closes any open round atomically"). `closed_by` is not in the
--    CHECK for 0029's reason: it is a users key the suite's cleanupUsers must
--    be able to release. `discussion_input_rounds_one_open_key` is the "at
--    most one open round at a time" rule, as a partial unique index, so two
--    racing opens cannot both land.
--
-- 2. `discussion_input_options`. The explicit options of a `choose` round,
--    written when the round opens and never edited, so a response's option
--    keeps meaning what it meant.
--
-- 3. `discussion_input_responses`. One current response per participant per
--    round (`discussion_input_responses_round_id_user_id_key`); change is an
--    UPDATE, withdraw is a DELETE, both refused by the application once the
--    round is closed, which is the freeze. The row carries its round's `mode`
--    under a composite key against (id, mode), so the shape CHECK can hold
--    each mode to its own columns in the database rather than by convention:
--    choose names exactly one option of *its own* round (composite key on
--    (round_id, option_id)), advice carries a non-blank body, concerns is
--    `no_concern | concern` and `concern` requires a non-blank reason.
--    Nothing here is a weight, a score, a veto or a winner (#321).
--
-- Every key to a round or a Discussion cascades, so a Discussion purge (and a
-- Folder purge through it) takes its rounds, options and responses with it.
-- The users keys are RESTRICT and listed in USER_RESTRICT_DISPOSALS as
-- outliving the account, 0029's reason: 8.10 scrubs a users row and never
-- deletes it, and a response is part of how the Folder decided.
--
-- Forward only and additive: three new tables, nothing backfilled.
CREATE TABLE discussion_input_rounds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  discussion_id uuid NOT NULL,
  mode text NOT NULL,
  prompt text NOT NULL,
  created_by uuid NOT NULL,
  state text NOT NULL DEFAULT 'open',
  close_reason text,
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discussion_input_rounds_pkey PRIMARY KEY (id),
  CONSTRAINT discussion_input_rounds_id_mode_key UNIQUE (id, mode),
  CONSTRAINT discussion_input_rounds_discussion_id_fkey
    FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
  CONSTRAINT discussion_input_rounds_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT discussion_input_rounds_closed_by_fkey
    FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT discussion_input_rounds_mode_check
    CHECK (mode IN ('choose', 'advice', 'concerns')),
  CONSTRAINT discussion_input_rounds_state_check
    CHECK (state IN ('open', 'closed')),
  CONSTRAINT discussion_input_rounds_prompt_length_check
    CHECK (char_length(btrim(prompt)) BETWEEN 1 AND 1000),
  -- Every operand is IS [NOT] NULL or a comparison on NOT NULL `state`, so
  -- the CHECK cannot pass by UNKNOWN.
  CONSTRAINT discussion_input_rounds_closure_check
    CHECK ((state = 'closed') = (closed_at IS NOT NULL)
           AND (state = 'closed') = (close_reason IS NOT NULL)),
  CONSTRAINT discussion_input_rounds_close_reason_check
    CHECK (close_reason IN ('closed', 'discussion_resolved'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX discussion_input_rounds_one_open_key
  ON discussion_input_rounds (discussion_id)
  WHERE state = 'open';
--> statement-breakpoint
CREATE INDEX discussion_input_rounds_discussion_idx
  ON discussion_input_rounds (discussion_id, created_at);
--> statement-breakpoint
CREATE TABLE discussion_input_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL,
  label text NOT NULL,
  position integer NOT NULL,
  CONSTRAINT discussion_input_options_pkey PRIMARY KEY (id),
  CONSTRAINT discussion_input_options_round_id_id_key UNIQUE (round_id, id),
  CONSTRAINT discussion_input_options_round_id_position_key UNIQUE (round_id, position),
  CONSTRAINT discussion_input_options_round_id_fkey
    FOREIGN KEY (round_id) REFERENCES discussion_input_rounds(id) ON DELETE CASCADE,
  CONSTRAINT discussion_input_options_label_length_check
    CHECK (char_length(btrim(label)) BETWEEN 1 AND 200),
  CONSTRAINT discussion_input_options_position_check CHECK (position >= 0)
);
--> statement-breakpoint
CREATE TABLE discussion_input_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL,
  mode text NOT NULL,
  user_id uuid NOT NULL,
  option_id uuid,
  concern text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discussion_input_responses_pkey PRIMARY KEY (id),
  CONSTRAINT discussion_input_responses_round_id_user_id_key UNIQUE (round_id, user_id),
  CONSTRAINT discussion_input_responses_round_mode_fkey
    FOREIGN KEY (round_id, mode)
    REFERENCES discussion_input_rounds(id, mode) ON DELETE CASCADE,
  CONSTRAINT discussion_input_responses_option_fkey
    FOREIGN KEY (round_id, option_id)
    REFERENCES discussion_input_options(round_id, id) ON DELETE CASCADE,
  CONSTRAINT discussion_input_responses_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT discussion_input_responses_concern_check
    CHECK (concern IN ('no_concern', 'concern')),
  CONSTRAINT discussion_input_responses_body_length_check
    CHECK (char_length(body) <= 4000),
  -- `mode` is NOT NULL and every other operand is IS [NOT] NULL, so the only
  -- comparison that could be UNKNOWN is `concern = 'concern'`, and it is
  -- reached only where the second line has made `concern` non-null.
  CONSTRAINT discussion_input_responses_shape_check
    CHECK ((mode = 'choose') = (option_id IS NOT NULL)
           AND (mode = 'concerns') = (concern IS NOT NULL)
           AND (mode <> 'choose' OR body IS NULL)
           AND (mode <> 'advice'
                OR (body IS NOT NULL AND char_length(btrim(body)) >= 1))
           AND (mode <> 'concerns' OR concern = 'no_concern'
                OR (body IS NOT NULL AND char_length(btrim(body)) >= 1)))
);
