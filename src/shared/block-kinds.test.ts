import { describe, expect, it } from 'vitest'
import { BLOCK_HOMES, allowedIn } from './block-kinds.js'
import { DOCUMENT_BLOCK_KINDS } from './page-document.js'
import { WORKFLOW_PAGE_BLOCK_KINDS, WORKFLOW_PURPOSE_BLOCK_KINDS } from './workflows.js'

/*
The registry must never refuse more than the four appliers refused before it
existed: a kind that stops being storable on a home is a block somebody
already has that can never be saved again. These are the old `if` chains,
written out once (page-document.ts, facets.ts, task-document.ts,
shelf-document.ts at becd705c). Step 7 widened `doc`: a Doc page holds what
the facet homes and Work's page links held.
*/
const REFUSED_BEFORE: Record<(typeof BLOCK_HOMES)[number], readonly string[]> = {
  work: ['result'],
  doc: ['page', 'section', 'folder_ref', 'result'],
  results: ['page', 'section', 'folder_ref'],
  task: ['page', 'section', 'folder_ref', 'result'],
  shelf: ['page', 'result'],
}

describe('block-kind registry', () => {
  it('refuses on each home no more than that home refused before', () => {
    for (const home of BLOCK_HOMES) {
      const refused = DOCUMENT_BLOCK_KINDS.filter((kind) => !allowedIn(kind, home))
      for (const kind of refused) {
        if (kind === 'person' || kind === 'synced') continue // These kinds did not exist in the old homes.
        expect(REFUSED_BEFORE[home], `${home} ${kind}`).toContain(kind)
      }
    }
  })

  it('stores on a Doc page everything a Work page stores, and every Results block', () => {
    for (const kind of DOCUMENT_BLOCK_KINDS) {
      if (allowedIn(kind, 'work') || allowedIn(kind, 'results')) expect(allowedIn(kind, 'doc'), kind).toBe(true)
    }
  })

  it('accepts every kind an imported workflow can carry where the import writes it', () => {
    for (const kind of WORKFLOW_PAGE_BLOCK_KINDS) expect(allowedIn(kind, 'work'), kind).toBe(true)
    for (const kind of WORKFLOW_PURPOSE_BLOCK_KINDS) expect(allowedIn(kind, 'doc'), kind).toBe(true)
  })
})
