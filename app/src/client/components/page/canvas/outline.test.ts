import { describe, expect, test } from 'vitest'
import { removesCanvasTask, validateCanvasOutline } from './outline.js'
import type { OutlineBlock } from './outline.js'

const prose = (id: string): OutlineBlock => ({ id, type: 'paragraph', props: {}, children: [] })
const task = (id: string, taskId = id): OutlineBlock => ({ id, type: 'danaTask', props: { taskId }, children: [] })
const heading = (id: string, level: number, children: OutlineBlock[]): OutlineBlock => ({ id, type: 'heading', props: { level }, children })

describe('Dana canvas structural boundary', () => {
  test('accepts explicit direct/subgroup membership and loose root content', () => {
    expect(validateCanvasOutline([
      prose('loose-before'), heading('group', 1, [task('direct'), heading('subgroup', 2, [task('nested')])]), prose('loose-after'),
    ])).toBeNull()
  })
  test('rejects orphan subgroups, nested top-level groups and third-level nesting', () => {
    for (const outline of [
      [heading('orphan', 2, [])],
      [heading('a', 1, [heading('b', 1, [])])],
      [heading('a', 1, [heading('b', 2, [heading('c', 2, [])])])],
      [heading('a', 1, [heading('b', 2, [heading('c', 3, [])])])],
    ]) expect(validateCanvasOutline(outline)).toContain('Only two levels')
  })
  test('rejects children hidden below prose and duplicate Task references', () => {
    expect(validateCanvasOutline([{ ...prose('a'), children: [task('b')] }])).toContain('Only headings')
    expect(validateCanvasOutline([task('a', 'same'), task('b', 'same')])).toContain('distinct Dana Task')
  })
  test('heading removal can lift a Task; mixed deletion cannot lose it', () => {
    const before = [heading('group', 1, [prose('context'), task('work')])]
    expect(removesCanvasTask(before, [prose('context'), task('work')])).toBe(false)
    expect(removesCanvasTask(before, [prose('context')])).toBe(true)
    expect(removesCanvasTask(before, [])).toBe(true)
  })
})
