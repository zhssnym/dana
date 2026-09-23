import { describe, expect, test } from 'vitest'
import { removesCanvasTask, validateCanvasOutline } from './outline.js'
import type { OutlineBlock } from './outline.js'

const prose = (id: string): OutlineBlock => ({
  id,
  type: 'paragraph',
  props: {},
  children: [],
})
const task = (id: string, taskId = id): OutlineBlock => ({
  id,
  type: 'danaTask',
  props: { taskId },
  children: [],
})
const heading = (
  id: string,
  level: number,
  children: OutlineBlock[],
): OutlineBlock => ({
  id,
  type: 'heading',
  props: { level, isToggleable: true },
  children,
})
const documentHeading = (id: string, level: number): OutlineBlock => ({
  id,
  type: 'heading',
  props: { level, isToggleable: false },
  children: [],
})
const list = (
  id: string,
  type: 'bulletListItem' | 'numberedListItem' | 'checkListItem',
  children: OutlineBlock[] = [],
): OutlineBlock => ({ id, type, props: {}, children })

describe('Dana canvas structural boundary', () => {
  test('accepts three Work heading levels and loose root content', () => {
    expect(
      validateCanvasOutline([
        prose('loose-before'),
        heading('group', 1, [
          task('direct'),
          heading('subgroup', 2, [
            heading('third', 3, [prose('deep')]),
          ]),
        ]),
        prose('loose-after'),
      ]),
    ).toBeNull()
  })

  test('accepts flat Purpose headings at any presentation level', () => {
    expect(
      validateCanvasOutline([
        documentHeading('h1', 1),
        documentHeading('h3', 3),
        prose('copy'),
      ]),
    ).toBeNull()
  })

  test('rejects invalid Work heading ancestry and nested document headings', () => {
    for (const outline of [
      [heading('orphan', 2, [])],
      [heading('a', 1, [heading('b', 1, [])])],
      [
        heading('a', 1, [
          heading('b', 2, [heading('c', 3, [heading('d', 3, [])])]),
        ]),
      ],
    ]) {
      expect(validateCanvasOutline(outline)).toContain('nested in order')
    }
    expect(
      validateCanvasOutline([
        heading('group', 1, [documentHeading('document', 2)]),
      ]),
    ).toContain('stay flat')
  })

  test('accepts mixed nested lists and rejects non-list list children', () => {
    expect(
      validateCanvasOutline([
        list('bullet', 'bulletListItem', [
          list('numbered', 'numberedListItem', [
            list('tick', 'checkListItem'),
          ]),
        ]),
      ]),
    ).toBeNull()
    expect(
      validateCanvasOutline([
        list('bullet', 'bulletListItem', [prose('not-list')]),
      ]),
    ).toContain('Only list items')
    expect(
      validateCanvasOutline([
        list('bullet', 'bulletListItem', [task('not-task')]),
      ]),
    ).toContain('Only list items')
  })

  test('rejects children hidden below prose and duplicate Task references', () => {
    expect(
      validateCanvasOutline([{ ...prose('a'), children: [task('b')] }]),
    ).toContain('Only Work headings and list items')
    expect(
      validateCanvasOutline([task('a', 'same'), task('b', 'same')]),
    ).toContain('distinct Dana Task')
  })

  test('heading removal can lift a Task; mixed deletion cannot lose it', () => {
    const before = [
      heading('group', 1, [prose('context'), task('work')]),
    ]
    expect(
      removesCanvasTask(before, [prose('context'), task('work')]),
    ).toBe(false)
    expect(removesCanvasTask(before, [prose('context')])).toBe(true)
    expect(removesCanvasTask(before, [])).toBe(true)
  })
})
