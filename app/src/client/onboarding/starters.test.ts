/*
The starters are data, and data that only the server validates is data that
fails in front of a person. So each one is parsed here with 7.16's own schema,
the same `importWorkflowBody` the endpoint runs, which makes a malformed
starter a red test rather than a 422 on somebody's first press.

These are unit tests of this module and not acceptance criteria; 9.13's
behaviour is asserted by the browser leg, which is the Adversarial Test role's.
What is checked here is the file contract and the two rules 9.13 states about
starter content that no schema can state for it.
*/
import { describe, expect, it } from 'vitest'

import { importWorkflowBody } from '../../shared/workflows.js'

import { STARTERS } from './starters.js'

const DELETABLE =
  'This is an example, and it is yours now. Change anything you like, or ' +
  'delete the whole folder from its menu when you are done with it.'

describe('9.13 starter workflows', () => {
  it('every starter parses as a 7.16 workflow file', () => {
    for (const starter of STARTERS) {
      const parsed = importWorkflowBody.safeParse(starter.file)
      expect(parsed.success, `${starter.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true)
    }
  })

  it('every starter folder opens with 9.13 normative deletion paragraph', () => {
    // The offer's copy is gone once it is answered, so this paragraph is the
    // only place a person is told the example is theirs to remove.
    for (const starter of STARTERS) {
      for (const folder of starter.file.folders) {
        const first = folder.blocks?.[0]
        expect(first, `${starter.id}: ${folder.name} has no page block`).toBeDefined()
        expect(first?.kind).toBe('paragraph')
        expect(first?.text).toBe(DELETABLE)
      }
    }
  })

  it('every starter carries tasks and page prose, since it teaches by holding both', () => {
    for (const starter of STARTERS) {
      for (const folder of starter.file.folders) {
        expect(folder.tasks?.length ?? 0, `${starter.id}: no tasks`).toBeGreaterThan(0)
        expect(
          folder.blocks?.some((block) => block.kind === 'section'),
          `${starter.id}: no section heading`,
        ).toBe(true)
      }
    }
  })

  it('the parsed file is exactly what was written, so no key is silently dropped', () => {
    /*
    zod strips what the schema does not name rather than refusing it (the
    module's own note), which is the property that makes a hostile file safe
    and would also make a typo in a starter silent. Comparing the parse to the
    source catches the second without weakening the first.
    */
    for (const starter of STARTERS) {
      const parsed = importWorkflowBody.parse(starter.file)
      expect(parsed, starter.id).toEqual(starter.file)
    }
  })

  it('the three ids are distinct, being React keys and the dismissal record', () => {
    const ids = STARTERS.map((starter) => starter.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
