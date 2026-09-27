import { describe, expect, it } from 'vitest'
import { BLOCK_HOMES, SLASH_COMMANDS, SLASH_MENUS, allowedIn } from './block-kinds.js'
import { DOCUMENT_BLOCK_KINDS } from './page-document.js'
import { WORKFLOW_PAGE_BLOCK_KINDS, WORKFLOW_PURPOSE_BLOCK_KINDS } from './workflows.js'

/*
The registry must refuse exactly what the four appliers refused before it
existed, and nothing more: a kind that stops being storable on a home is a
block somebody already has that can never be saved again. These are the old
`if` chains, written out once (page-document.ts, facets.ts, task-document.ts,
shelf-document.ts at becd705c).
*/
const REFUSED_BEFORE: Record<(typeof BLOCK_HOMES)[number], readonly string[]> = {
  work: ['result'],
  doc: ['page', 'section', 'folder_ref', 'result'],
  results: ['page', 'section', 'folder_ref'],
  task: ['page', 'section', 'folder_ref', 'result'],
  shelf: ['page', 'result'],
}

describe('block-kind registry', () => {
  it('stores on each home exactly what that home stored before', () => {
    for (const home of BLOCK_HOMES) {
      const refused = DOCUMENT_BLOCK_KINDS.filter((kind) => !allowedIn(kind, home))
      expect([...refused].sort(), home).toEqual([...REFUSED_BEFORE[home]].sort())
    }
  })

  it('accepts every kind an imported workflow can carry where the import writes it', () => {
    for (const kind of WORKFLOW_PAGE_BLOCK_KINDS) expect(allowedIn(kind, 'work'), kind).toBe(true)
    for (const kind of WORKFLOW_PURPOSE_BLOCK_KINDS) expect(allowedIn(kind, 'doc'), kind).toBe(true)
  })
})

describe('slash menus', () => {
  it('offer on each home only blocks that home stores', () => {
    for (const home of BLOCK_HOMES) {
      for (const command of SLASH_MENUS[home]) {
        const kind = SLASH_COMMANDS[command]
        if (kind !== null) expect(allowedIn(kind, home), `${home} /${command}`).toBe(true)
      }
    }
  })
})
