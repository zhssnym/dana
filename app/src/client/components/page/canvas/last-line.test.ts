/*
AC-1440: a Task typed in Work's last line lands at the end of the page, in the
innermost last Section, or, on a phone whose line is pinned, at the end of the
Section in view; an empty last line is reused, never followed by another.
*/
import { describe, expect, test } from 'vitest'
import { lastLinePlace } from './commands.js'
import type { CanvasBlock } from './schema.js'

type Node = { id: string; type: string; props?: Record<string, unknown>; content?: unknown[]; children?: Node[] }
const section = (id: string, level: number, children: Node[] = []): Node => ({ id, type: 'heading', props: { level, isToggleable: true }, content: [{ type: 'text', text: id }], children })
const text = (id: string, words = id): Node => ({ id, type: 'paragraph', props: {}, content: words === '' ? [] : [{ type: 'text', text: words }] })
const task = (id: string): Node => ({ id, type: 'danaTask', props: { taskId: id } })
const doc = (...blocks: Node[]): CanvasBlock[] => {
  const fill = (block: Node): Node => ({ props: {}, content: [], ...block, children: (block.children ?? []).map(fill) })
  return blocks.map(fill) as unknown as CanvasBlock[]
}

describe('AC-1440 where the last line writes', () => {
  test('after the last block of the innermost last Section', () => {
    const page = doc(section('a', 1, [task('t1')]), section('b', 1, [text('p'), section('b2', 2, [task('t2'), task('t3')])]))
    expect(lastLinePlace(page)).toEqual({ after: 't3' })
  })

  test('into a last Section that holds nothing yet, and after plain writing on a page without Sections', () => {
    expect(lastLinePlace(doc(section('a', 1, [task('t1')]), section('b', 1)))).toEqual({ into: 'b' })
    expect(lastLinePlace(doc(text('p'), task('t1')))).toEqual({ after: 't1' })
  })

  test('an empty last line is reused', () => {
    expect(lastLinePlace(doc(section('a', 1, [task('t1'), text('e', '')])))).toEqual({ reuse: 'e' })
  })

  test('the Section in view takes it at its own end, and one that is gone or not a Section falls back to the page end', () => {
    const page = doc(section('a', 1, [task('t1'), section('a2', 2, [task('t2')])]), section('b', 1, [task('t3')]))
    expect(lastLinePlace(page, 'a')).toEqual({ after: 'a2' })
    expect(lastLinePlace(page, 'a2')).toEqual({ after: 't2' })
    expect(lastLinePlace(page, 'gone')).toEqual({ after: 't3' })
    expect(lastLinePlace(page, 't1')).toEqual({ after: 't3' })
  })
})
