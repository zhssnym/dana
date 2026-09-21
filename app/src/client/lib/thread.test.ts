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

**What it pins.** `deletable`, `editable` and `likeable` are the whole of
what `components/comments.tsx` draws its three controls from, and each is
answered once per comment so that the card mount and the folder page cannot
disagree (L-201). Every one multiplies a **per-comment** fact by a
**per-folder** bar, and until 2026-09-20 (issue #268) every one of them was
wrong:

- Delete was `mine || is_owner`. Moderation is `comment.moderate`, Full
  control's, which custody neither confers nor implies — so the second half
  named the wrong fact.
- And `mine` was the wrong *first* half of the same expression, and of Edit,
  which was `mine` outright. `comment.mutate.own` is authorship **and**
  currently holding Can comment or better, #228's authorship rule making
  authorship provenance rather than standing authority. A member reduced to
  Can view was offered Edit and Delete on every comment they had ever left
  and answered 403 by the route; AC-518 pins those refusals from the
  server's side.
- Like was offered to everybody. `comment.like` is Can comment's, and Can
  view reads a thread and leaves no mark on it.

Pure functions only. The hook over `toConceptComments` is a `useMemo` around
it, and a case that mounted one would be testing TanStack Query — the rule
`adapter-seam.test.ts` states for the rest of this seam.
*/
import { describe, expect, test } from 'vitest'

import type { CommentLine } from '../../shared/comments.js'
import { folderGates } from './folder-authority.js'
import { toConceptComments } from './thread.js'
import type { ThreadAuthority } from './thread.js'

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

/** What the folder page and the task card hand this module: the three gates,
 * over the viewer's own membership facts, exactly as both surfaces build
 * them. Built through `folderGates` rather than written out, so a case here
 * cannot pass on a bar this file invented. */
function may(
  access: Parameters<typeof folderGates>[0]['access'],
  isOwner = false,
): ThreadAuthority {
  const gates = folderGates({ access, isOwner, isDefault: false })
  return {
    moderate: gates.moderate,
    mutateOwnComment: gates.mutateOwnComment,
    likeComment: gates.likeComment,
    createComment: gates.createComment,
  }
}

describe('AC-790 who a thread offers Delete to', () => {
  test('AC-790: a Full-control administrator who owns nothing is offered another member’s comment', () => {
    const drawn = toConceptComments(
      [line()],
      VIEWER,
      personOf,
      NOW,
      may('full_control'),
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
      may('can_comment', true),
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
      may('can_comment', true),
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
      may('full_control'),
    )
    expect(drawn[0]?.replies?.[0]?.deletable).toBe(true)
  })

  test('AC-790: a surface with no standing in hand falls back to the lab', () => {
    const drawn = toConceptComments(
      [line({ author_id: VIEWER }), line({ id: '77777777-7777-4777-8777-777777777777' })],
      VIEWER,
      personOf,
      NOW,
    )
    expect(drawn[0]?.deletable).toBe(true)
    expect(drawn[0]?.editable).toBe(true)
    expect(drawn[1]?.deletable).toBe(false)
    expect(drawn[1]?.editable).toBe(false)
    expect(drawn[0]?.likeable, 'the lab lets everybody like').toBe(true)
  })

  test('AC-790: a member downgraded to Can view keeps their words and is offered nothing', () => {
    const drawn = toConceptComments(
      [line({ author_id: VIEWER }), line({ id: '88888888-8888-4888-8888-888888888888' })],
      VIEWER,
      personOf,
      NOW,
      may('can_view'),
    )
    expect(
      drawn[0]?.editable,
      '#228: authorship is provenance rather than standing authority, so Can view loses the pencil on their own comment',
    ).toBe(false)
    expect(
      drawn[0]?.deletable,
      'and the delete with it — AC-518 is the route refusing exactly this',
    ).toBe(false)
    expect(drawn[1]?.deletable, 'and certainly not somebody else’s').toBe(false)
    expect(
      drawn[0]?.likeable,
      '#228’s Can-comment list: Can view reads the thread and leaves no mark on it',
    ).toBe(false)
    expect(
      drawn[0]?.body,
      'the words themselves stay readable exactly as they were',
    ).toBe('somebody else said this')
  })

  test('AC-790: a Can-comment author is offered Edit, Delete and Like on their own', () => {
    const drawn = toConceptComments(
      [line({ author_id: VIEWER })],
      VIEWER,
      personOf,
      NOW,
      may('can_comment'),
    )
    expect(drawn[0]?.editable).toBe(true)
    expect(drawn[0]?.deletable).toBe(true)
    expect(drawn[0]?.likeable).toBe(true)
  })

  test('AC-790: Can view is offered no Reply on any comment in the thread', () => {
    const drawn = toConceptComments(
      [line({ author_id: VIEWER }), line({ id: '99999999-9999-4999-8999-999999999999' })],
      VIEWER,
      personOf,
      NOW,
      may('can_view'),
    )
    for (const comment of drawn) {
      expect(
        comment.replyable,
        'replying is `comment.create`, the same act as a first comment, and Can view does not write into a thread',
      ).toBe(false)
    }
  })

  test('AC-790: Can comment replies, and so does every preset above it', () => {
    for (const preset of ['can_comment', 'assigned_work', 'can_edit', 'full_control'] as const) {
      const drawn = toConceptComments([line()], VIEWER, personOf, NOW, may(preset))
      expect(drawn[0]?.replyable, preset).toBe(true)
    }
  })

  test('AC-790: the lab replies, so a surface with no standing in hand offers it', () => {
    const drawn = toConceptComments([line()], VIEWER, personOf, NOW)
    expect(drawn[0]?.replyable).toBe(true)
  })

  test('AC-790: a Full-control administrator moderates but never edits another’s words', () => {
    const drawn = toConceptComments([line()], VIEWER, personOf, NOW, may('full_control'))
    expect(drawn[0]?.deletable, 'moderation removes').toBe(true)
    expect(
      drawn[0]?.editable,
      'and does not rewrite: no preset lets one member edit another, which is #228 read exactly as written',
    ).toBe(false)
  })
})
