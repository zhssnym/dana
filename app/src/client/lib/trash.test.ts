/*
Who Trash offers a permanent delete to, which is AC-790's third surface.

**Why this file is here and not in `tests/criteria/`.** The same compile
reason `thread.test.ts` beside it carries: `tsconfig.server.json` compiles
every `.ts` under `tests/` with `lib: ["es2023"]` and no jsx, and this module
reaches the DOM through `api/queries.js` and `api/mutations.js`. The half of
AC-790 that needs a database lives in
`tests/criteria/ac-790-comment-moderation-follows-access.test.ts`; this half
carries the number in its assertions, which is what `app/tests/README.md`
means by a criterion running.

**What it pins, and why it is two answers rather than one.** `purgeable` was
`is_owner` for both kinds until 2026-09-20 (issue #268), which was RFC 0005
change control item 38's rule and had been superseded by #228's R8A. The two
acts are not one rule:

- `task.destroy` — Full control, ownership **ignored**;
- `folder.destroy` — Full control **and** the owner together (governing R5).

So a single boolean off a single field could not have been right whatever
field it read, and the cases below are written as the three ways the screen
was wrong rather than as a table of presets, which `folder-authority.test.ts`
already carries beside the gate.

Pure functions only.
*/
import { describe, expect, test } from 'vitest'

import type { FolderAccessPreset } from '../../shared/folder-access.js'
import { mayPurge } from './trash.js'

function row(access: FolderAccessPreset, isOwner: boolean) {
  return { my_access: access, is_owner: isOwner }
}

describe('AC-790 who Trash offers a permanent delete to', () => {
  test('AC-790: a Full-control member who owns nothing destroys a trashed task', () => {
    expect(
      mayPurge(row('full_control', false), 'task'),
      "#228's Full-control list: permanently deleting a Task from Trash is an irreversible administrative act, and ownership is ignored by it",
    ).toBe(true)
  })

  test('AC-790: and is still not offered the folder, the two acts being two rules', () => {
    expect(
      mayPurge(row('full_control', false), 'folder'),
      'governing R5: permanent destruction of the whole Folder keeps custody in it',
    ).toBe(false)
  })

  test('AC-790: a demoted owner is offered neither', () => {
    expect(
      mayPurge(row('can_comment', true), 'task'),
      'custody is not Access: an owner below Full control destroys no trashed task',
    ).toBe(false)
    expect(
      mayPurge(row('can_comment', true), 'folder'),
      'nor the folder they still own',
    ).toBe(false)
  })

  test('AC-790: the owner who kept Full control is offered both, which is the case that never broke', () => {
    expect(mayPurge(row('full_control', true), 'task')).toBe(true)
    expect(mayPurge(row('full_control', true), 'folder')).toBe(true)
  })

  test('AC-790: Can edit is below the bar on both, ownership or not', () => {
    for (const isOwner of [false, true]) {
      expect(mayPurge(row('can_edit', isOwner), 'task')).toBe(false)
      expect(mayPurge(row('can_edit', isOwner), 'folder')).toBe(false)
    }
  })
})
