// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'

import type { ConnectedWorkItem, ConnectedWorkSource } from '../../../shared/connected-work.js'
import {
  connectedSourceDocumentRoute,
  connectedWorkKey,
  connectedWorkSourceKey,
  placementKeyOf,
  placementSourceOf,
  promotedSourceOf,
  promotionBlock,
} from './connected-work.js'

const FACET = '00000000-0000-4000-8000-000000000010'
const HOME = '00000000-0000-4000-8000-000000000020'
const SOURCE_A = '00000000-0000-4000-8000-000000000030'
const SOURCE_B = '00000000-0000-4000-8000-000000000031'

function source(id: string): ConnectedWorkSource {
  return {
    id,
    kind: 'block',
    block_kind: 'paragraph',
    text: id === SOURCE_A ? 'First source' : 'Second source',
    files: [],
  }
}

function row(home: ConnectedWorkItem['home'] = 'task'): ConnectedWorkItem {
  return {
    surface: 'page',
    home,
    home_id: HOME,
    folder_id: HOME,
    member_id: null,
    label: 'Same source document',
    block_ids: [SOURCE_A, SOURCE_B],
    sources: [source(SOURCE_A), source(SOURCE_B)],
  }
}

function editorBlock(input: NonNullable<ReturnType<typeof promotionBlock>>) {
  return {
    id: '00000000-0000-4000-8000-000000000050',
    type: input.type ?? 'paragraph',
    content: input.content as readonly unknown[],
    children: [],
  }
}

describe('connected work one source per placement', () => {
  test('two exact source blocks from one document have distinct placement identities', () => {
    const ownRow = row()
    expect(connectedWorkSourceKey(ownRow, SOURCE_A)).not.toBe(connectedWorkSourceKey(ownRow, SOURCE_B))
    expect(connectedWorkSourceKey(ownRow, SOURCE_A)).toContain(connectedWorkKey(ownRow))
  })

  test('the durable marker carries the exact source as well as the document relation', () => {
    const ownRow = row()
    const promoted = promotionBlock(ownRow, ownRow.sources[0]!, FACET, true)!
    const block = editorBlock(promoted)

    expect(placementKeyOf(block, FACET)).toBe(connectedWorkKey(ownRow))
    expect(placementSourceOf(block, FACET)).toBe(SOURCE_A)
    expect(promotedSourceOf(block, FACET)).toBe(SOURCE_A)

    const link = (promoted.content as Array<{ type: string; props?: { href?: string } }>).find((part) => part.type === 'danaLink')
    expect(link?.props?.href).toContain(`connected-source=${SOURCE_A}`)
  })

  test('editable mirrors use the canonical source document transaction route', () => {
    expect(connectedSourceDocumentRoute(row('task'))).toEqual({
      read: `/tasks/${HOME}/document`,
      write: `/tasks/${HOME}/document`,
      method: 'PUT',
    })
    expect(connectedSourceDocumentRoute(row('shelf'))).toEqual({
      read: `/shelves/${HOME}/page`,
      write: `/shelves/${HOME}/page/actions`,
      method: 'POST',
    })
    expect(connectedSourceDocumentRoute(row('folder'))).toEqual({
      read: `/folders/${HOME}/page`,
      write: `/folders/${HOME}/page/actions`,
      method: 'POST',
    })
  })
})
