import { describe, expect, test } from 'vitest'

import { validateCanvasOutline } from './outline.js'
import { conversionOf, simulate, simulateNest, TURN_TARGETS } from './turn-into.js'
import type { TreeBlock } from './turn-into.js'

const target = (key: string) => TURN_TARGETS.find((item) => item.key === key)!
const block = (id: string, type: string, props: Record<string, unknown> = {}, children: TreeBlock[] = []): TreeBlock =>
  ({ id, type, props, content: [{ type: 'text', text: id, styles: {} }], children })

describe('Turn into', () => {
  test('a section heading turned into text lifts its content out after it, keeping every block', () => {
    const doc = [block('h', 'heading', { level: 1, isToggleable: true }, [block('p', 'paragraph'), block('t', 'danaTask', { taskId: 'x' })])]
    const next = simulate(doc, 'h', target('text'), true)
    expect(next.map((item) => item.id)).toEqual(['h', 'p', 't'])
    expect(next[0]!.children).toEqual([])
    expect(validateCanvasOutline(next)).toBeNull()
  })

  test('a list keeps its nested items when it becomes another list kind', () => {
    const doc = [block('a', 'bulletListItem', {}, [block('b', 'bulletListItem')])]
    const next = simulate(doc, 'a', target('todo'), true)
    expect(next[0]!.type).toBe('checkListItem')
    expect(next[0]!.children.map((item) => item.id)).toEqual(['b'])
  })

  test('code holds plain text, and leaving code gives it back as runs', () => {
    const rich = { ...block('p', 'paragraph'), content: [{ type: 'text', text: 'a', styles: { bold: true } }, { type: 'link', href: 'x', content: [{ type: 'text', text: 'b', styles: {} }] }] }
    expect(conversionOf(rich, target('code'), undefined).update.content).toBe('ab')
    expect(conversionOf(rich, target('quote'), undefined).update.content).toBeUndefined()
  })

  test('Tab nests under the previous sibling, and a first block has none', () => {
    const doc = [block('a', 'bulletListItem'), block('b', 'bulletListItem')]
    expect(simulateNest(doc, 'a')).toBeNull()
    const next = simulateNest(doc, 'b')!
    expect(next.map((item) => item.id)).toEqual(['a'])
    expect(next[0]!.children.map((item) => item.id)).toEqual(['b'])
    // Text under text is a shape the canvas refuses, so Tab does nothing there.
    expect(validateCanvasOutline(simulateNest([block('p', 'paragraph'), block('q', 'paragraph')], 'q')!)).not.toBeNull()
  })
})
