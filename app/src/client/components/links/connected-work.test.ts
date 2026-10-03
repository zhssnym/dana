// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'

import type { ConnectedWorkItem, ConnectedWorkSource } from '../../../shared/connected-work.js'
import {
  connectedWorkKey,
  placementKeyOf,
  promotedSourceOf,
  promotionBlock,
  promotionStatement,
} from './connected-work.js'

const FACET = '00000000-0000-4000-8000-000000000010'
const HOME = '00000000-0000-4000-8000-000000000020'
const SOURCE = '00000000-0000-4000-8000-000000000030'
const FILE = '00000000-0000-4000-8000-000000000040'

function source(overrides: Partial<ConnectedWorkSource> = {}): ConnectedWorkSource {
  return {
    id: SOURCE,
    kind: 'block',
    block_kind: 'paragraph',
    text: 'Approved final design',
    files: [],
    ...overrides,
  }
}

function row(ownSource: ConnectedWorkSource): ConnectedWorkItem {
  return {
    surface: 'page',
    home: 'task',
    home_id: HOME,
    folder_id: HOME,
    member_id: null,
    label: 'Prepare client package',
    block_ids: [SOURCE],
    sources: [ownSource],
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

describe('connected work promotion', () => {
  test('explicit Results promotion becomes a native Result and keeps exact-source provenance', () => {
    const ownSource = source()
    const ownRow = row(ownSource)
    const promoted = promotionBlock(ownRow, ownSource, FACET, true)

    expect(promoted?.type).toBe('result')
    expect(promotionStatement(ownRow, ownSource)).toBe('Approved final design')

    const content = promoted?.content as Array<{ type: string; text?: string; props?: { href?: string } }>
    expect(content[0]).toMatchObject({ type: 'text', text: 'Approved final design' })
    const chip = content.find((inline) => inline.type === 'danaLink')
    expect(chip?.props?.href).toContain(`/app/tasks/${HOME}`)
    expect(chip?.props?.href).toContain(`connected-facet=${FACET}`)
    expect(chip?.props?.href).toContain(`promoted-source=${SOURCE}`)
    expect(chip?.props?.href).toContain(`#block-${SOURCE}`)

    const block = editorBlock(promoted!)
    expect(placementKeyOf(block, FACET)).toBe(connectedWorkKey(ownRow))
    expect(promotedSourceOf(block, FACET)).toBe(SOURCE)
  })

  test('a non-Results facet receives ordinary authored text with the same provenance marker', () => {
    const ownSource = source()
    const ownRow = row(ownSource)
    const promoted = promotionBlock(ownRow, ownSource, FACET, false)

    expect(promoted?.type).toBe('paragraph')
    const block = editorBlock(promoted!)
    expect(placementKeyOf(block, FACET)).toBe(connectedWorkKey(ownRow))
    expect(promotedSourceOf(block, FACET)).toBe(SOURCE)
  })

  test('a file-only source promotes the file name instead of inventing copy', () => {
    const ownSource = source({
      block_kind: 'file',
      text: 'final-design.pdf',
      files: [{ id: FILE, name: 'final-design.pdf' }],
    })
    const ownRow = row(ownSource)

    expect(promotionStatement(ownRow, ownSource)).toBe('final-design.pdf')
    const promoted = promotionBlock(ownRow, ownSource, FACET, true)
    const content = promoted?.content as Array<{ type: string; text?: string }>
    expect(content[0]).toMatchObject({ type: 'text', text: 'final-design.pdf' })
  })
})
