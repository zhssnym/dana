import { describe, expect, test } from 'vitest'

import { validateCanvasOutline } from './outline.js'
import { conversionOf, isCurrent, simulate, simulateNest, TURN_TARGETS } from './turn-into.js'
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
    // Any block nests under text (0038); nothing nests under code.
    expect(validateCanvasOutline(simulateNest([block('p', 'paragraph'), block('q', 'paragraph')], 'q')!)).toBeNull()
    expect(validateCanvasOutline(simulateNest([block('c', 'codeBlock'), block('q', 'paragraph')], 'q')!)).not.toBeNull()
  })

  test('text keeps its nested blocks when it becomes a quote, and gives them up only to code', () => {
    const doc = [block('p', 'paragraph', {}, [block('c', 'image')])]
    expect(simulate(doc, 'p', target('quote'), false)[0]!.children.map((item) => item.id)).toEqual(['c'])
    expect(simulate(doc, 'p', target('code'), false).map((item) => item.id)).toEqual(['p', 'c'])
  })

  test('a toggle heading is a presentation heading that folds, never a Section', () => {
    const doc = [block('p', 'paragraph', {}, [block('q', 'paragraph')])]
    const next = simulate(doc, 'p', target('th2'), false)
    expect(next[0]!.props).toMatchObject({ level: 2, isToggleable: true, presentation: true })
    expect(next[0]!.children.map((item) => item.id)).toEqual(['q'])
    expect(validateCanvasOutline(next)).toBeNull()
    // Heading 2 and Toggle heading 2 are different targets of the same block.
    expect(isCurrent(next[0]!, target('th2'))).toBe(true)
    expect(isCurrent(next[0]!, target('h2'))).toBe(false)
    const flat = simulate(next, 'p', target('h2'), false)
    expect(flat[0]!.props).toMatchObject({ isToggleable: false, presentation: false })
  })
})

describe('the canvas outline', () => {
  test('nests any block under text, and refuses a Section or a Task under it', () => {
    expect(validateCanvasOutline([block('p', 'paragraph', {}, [block('i', 'image'), block('d', 'divider'), block('c', 'codeBlock')])])).toBeNull()
    expect(validateCanvasOutline([block('p', 'paragraph', {}, [block('h', 'heading', { level: 1, isToggleable: true })])])).not.toBeNull()
    expect(validateCanvasOutline([block('p', 'paragraph', {}, [block('t', 'danaTask', { taskId: 'x' })])])).not.toBeNull()
    // A presentation heading nests and holds.
    expect(validateCanvasOutline([block('p', 'paragraph', {}, [block('h', 'heading', { level: 2, isToggleable: false }, [block('q', 'quote')])])])).toBeNull()
  })

  test('nests twelve levels deep and no deeper', () => {
    const chain = (depth: number): TreeBlock => depth === 0 ? block(`b${depth}`, 'paragraph') : block(`b${depth}`, 'paragraph', {}, [chain(depth - 1)])
    // A root block is depth 0, so a chain of 13 blocks reaches depth 12.
    expect(validateCanvasOutline([chain(12)])).toBeNull()
    expect(validateCanvasOutline([chain(13)])).not.toBeNull()
  })

  test('a Section keeps its own rules: at the root or in a Section, level by depth', () => {
    const section = (id: string, level: number, children: TreeBlock[] = []) => block(id, 'heading', { level, isToggleable: true }, children)
    expect(validateCanvasOutline([section('a', 1, [section('b', 2, [block('p', 'paragraph', {}, [block('q', 'bulletListItem')])])])])).toBeNull()
    expect(validateCanvasOutline([section('a', 1, [section('b', 1)])])).not.toBeNull()
  })
})
