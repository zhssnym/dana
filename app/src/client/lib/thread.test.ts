/*
Who a conversation offers Delete to, which is the second half of AC-790.

**Why this file is here and not in `tests/criteria/`.** The criterion's other
half needs a database and is
`tests/criteria/ac-790-comment-moderation-follows-access.test.ts`, which
`tsconfig.server.json` compiles with `lib: ["es2023"]` and no jsx. This module
reaches the DOM and a `.tsx` through `api/queries.js`, so it cannot be
imported from there at all; the tsconfig pair's own rule is that a test under
`tests/` wanting the DOM is `.tsx`, and a `.tsx` cannot hold the database half.
So the criterion is split by what each half can compile against rather than by
what it proves, and this half carries the number in its assertions, which is
what `app/tests/README.md` means by a criterion running.

**What it pins.** `deletable` is the whole of what
`components/comments.tsx` draws its Delete control from, and it is answered
once per comment so that the card mount and the folder page cannot disagree
(L-201). Two facts go into it and they have different shapes: **authorship**,
which is per comment, and **moderation**, which is per folder and is
`folderGates(...).moderate` — #228's Full-control list, not custody. The
parameter was `ownerDeletes` and read `is_owner` until 2026-09-20 (issue
#268), which had been false since R8A landed, so the cases below are written
as the two directions that were wrong on the screen.

Pure functions only. The hook over `toConceptComments` is a `useMemo` around
it, and a case that mounted one would be testing TanStack Query — the rule
`adapter-seam.test.ts` states for the rest of this seam.
*/
import { describe, expect, test } from 'vitest'

import type { CommentLine } from '../../shared/comments.js'
import { folderGates } from './folder-authority.js'
import { toConceptComments } from './thread.js'

const VIEWER = '11111111-1111-4111-8111-111111111111'
const SOMEBODY_ELSE = '22222222-2222-4222-8222-222222222222'
const NOW = Date.parse('2026-09-20T11:00:00.000Z')

function line(overrides: Partial<CommentLine> = {}): CommentLine {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    folder_id: '44444444-4444-4444-8444-444444444444',
    task_id: null,
    parent_id: null,
    author_id: SOMEBODY_ELSE,
    body: 'somebody else said this',
    likes: 0,
    liked: false,
    files: [],
    created_at: '2026-09-20T10:00:00.000Z',
    edited_at: null,
    ...overrides,
  }
}

const personOf = (): { name: string } => ({ name: 'Someone' })

/** What the folder page and the task card hand this module: the one gate,
 * over the viewer's own membership facts. */
function moderatesAs(access: Parameters<typeof folderGates>[0]['access'], isOwner: boolean) {
  return folderGates({ access, isOwner, isDefault: false }).moderate
}

describe('AC-790 who a thread offers Delete to', () => {
  test('AC-790: a Full-control administrator who owns nothing is offered another member’s comment', () => {
    const drawn = toConceptComments(
      [line()],
      VIEWER,
      personOf,
      NOW,
      moderatesAs('full_control', false),
    )
    expect(
      drawn[0]?.deletable,
      "#228's Full-control list: moderating another member's words is member administration, and custody is not required for it",
    ).toBe(true)
  })

  test('AC-790: an owner demoted to Can comment is offered nothing on another member’s comment', () => {
    const drawn = toConceptComments(
      [line()],
      VIEWER,
      personOf,
      NOW,
      moderatesAs('can_comment', true),
    )
    expect(
      drawn[0]?.deletable,
      'custody is not Access: the screen must not offer a control the route answers 403',
    ).toBe(false)
  })

  test('AC-790: authorship is the other half and is per comment, not per folder', () => {
    const drawn = toConceptComments(
      [line({ author_id: VIEWER }), line({ id: '55555555-5555-4555-8555-555555555555' })],
      VIEWER,
      personOf,
      NOW,
      moderatesAs('can_comment', true),
    )
    expect(
      drawn[0]?.deletable,
      'the demoted owner still removes their own words: `comment.mutate.own`, not moderation',
    ).toBe(true)
    expect(drawn[1]?.deletable, "and still not anybody else's").toBe(false)
  })

  test('AC-790: a reply answers the same as a top-level comment, both mounts agreeing', () => {
    const drawn = toConceptComments(
      [
        line(),
        line({
          id: '66666666-6666-4666-8666-666666666666',
          parent_id: '33333333-3333-4333-8333-333333333333',
        }),
      ],
      VIEWER,
      personOf,
      NOW,
      moderatesAs('full_control', false),
    )
    expect(drawn[0]?.replies?.[0]?.deletable).toBe(true)
  })

  test('AC-790: a surface with no standing in hand falls back to authorship alone', () => {
    const drawn = toConceptComments([line({ author_id: VIEWER }), line({ id: '77777777-7777-4777-8777-777777777777' })], VIEWER, personOf, NOW)
    expect(drawn[0]?.deletable).toBe(true)
    expect(drawn[1]?.deletable).toBe(false)
  })
})
