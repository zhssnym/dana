import { describe, expect, test } from 'vitest'

import { elision, freezeElision, threadModel, threadStyle } from './thread-model.js'
import type { FrozenElision, ThreadBlock, ThreadInput, ThreadTask } from './thread-model.js'

const TODAY = '2026-09-26'
const task = (id: string): ThreadBlock => ({ id, type: 'danaTask', props: { taskId: id } })
const note = (id: string): ThreadBlock => ({ id, type: 'paragraph', props: {} })
const section = (id: string, children: ThreadBlock[], level = 1): ThreadBlock => ({ id, type: 'heading', props: { level, isToggleable: true }, children })
const card = (over: Partial<ThreadTask> = {}): ThreadTask => ({ blocked_by_count: 0, start_date: null, assignee: null, ...over })

function input(blocks: ThreadBlock[], open: Record<string, ThreadTask>, over: Partial<ThreadInput> = {}): ThreadInput {
  return { blocks, open: new Map(Object.entries(open)), today: TODAY, viewerId: 'me', shared: false, ...over }
}

describe('AC-1501: the next ring is the first task the viewer can do now', () => {
  const blocks = [
    section('s1', [task('blocked'), task('later'), task('theirs'), task('mine')]),
    section('s2', [task('elsewhere')]),
  ]
  const open = {
    blocked: card({ blocked_by_count: 1 }),
    later: card({ start_date: '2026-09-27' }),
    theirs: card({ assignee: { id: 'sara' } }),
    mine: card({ assignee: { id: 'me' } }),
    elsewhere: card(),
  }

  test('skips a blocked task, a future start and another member’s task on a shared page', () => {
    expect(threadModel(input(blocks, open, { shared: true })).next).toBe('mine')
  })

  test('on a solo page another assignee does not matter', () => {
    expect(threadModel(input(blocks, open)).next).toBe('theirs')
  })

  test('a start of today is not waiting', () => {
    expect(threadModel(input(blocks, { ...open, later: card({ start_date: TODAY }) })).next).toBe('later')
  })

  test('closed tasks never ring, and nothing open means no ring', () => {
    expect(threadModel(input(blocks, { elsewhere: card() })).next).toBe('elsewhere')
    expect(threadModel(input(blocks, {})).next).toBeNull()
  })
})

describe('AC-1502: the line is solid up to the first open task and dashed after it', () => {
  test('once for the whole thread: a later section holding open work is dashed from its first line', () => {
    const blocks = [
      section('s1', [task('d1'), task('o1')]),
      section('s2', [note('intro'), task('o2'), task('o3')]),
    ]
    const { line } = threadModel(input(blocks, { o1: card(), o2: card(), o3: card() }))
    expect(line.get('o1')).toBe('frontier')
    expect(line.get('s2')).toBe('dashed')
    expect(line.get('intro')).toBe('dashed')
    expect(line.get('o2')).toBe('dashed')
  })

  test('within a section, and between sections', () => {
    const blocks = [
      section('s1', [task('d1'), note('n1'), task('d2')]),
      section('s2', [task('d3'), note('n2'), task('o1'), note('n3'), task('o2')]),
      section('s3', [task('d4')]),
    ]
    const { line, anyOpen, hasTasks } = threadModel(input(blocks, { o1: card(), o2: card() }))
    // Section 1 is all done: solid throughout.
    for (const id of ['s1', 'd1', 'n1', 'd2']) expect(line.get(id)).toBeUndefined()
    // The join is solid down to the first section holding an open task.
    // A section holding the frontier stays solid; its own list switches.
    expect(line.get('s2')).toBeUndefined()
    expect(line.get('s3')).toBe('dashed')
    // Inside it: solid to the first open task, dashed from there on.
    expect(line.get('d3')).toBeUndefined()
    expect(line.get('n2')).toBeUndefined()
    expect(line.get('o1')).toBe('frontier')
    expect(line.get('n3')).toBe('dashed')
    expect(line.get('o2')).toBe('dashed')
    expect([anyOpen, hasTasks]).toEqual([true, true])
  })

  test('a finished thread is solid everywhere', () => {
    const model = threadModel(input([section('s1', [task('d1')]), task('d2')], {}))
    expect(model.line.size).toBe(0)
    expect(model.anyOpen).toBe(false)
    expect(model.hasTasks).toBe(true)
  })
})

describe('AC-1502: long done stretches elide, and headings never fold', () => {
  test('a dropped task is closed: it never rings and the line ignores it', () => {
    const blocks = [section('s', [task('d1'), task('dropped'), note('n1')]), section('t', [task('o1')])]
    const open = new Map([['dropped', card({ status: 'abandoned' })], ['o1', card()]])
    const model = threadModel(input(blocks, Object.fromEntries(open)))
    expect(model.next).toBe('o1')
    expect(model.line.get('dropped')).toBeUndefined()
    expect(model.line.get('o1')).toBe('frontier')
    expect(threadModel(input([section('s', [task('dropped')])], { dropped: card({ status: 'abandoned' }) })).anyOpen).toBe(false)
    const long = [task('a'), task('b'), task('c'), task('e'), task('dropped'), task('o1')]
    expect([...elision(long, new Map([...open])).elided.keys()]).toEqual(['a', 'b'])
  })

  test('five or more closed tasks before the first open one keep only the last three', () => {
    const list = [note('intro'), task('d1'), note('n1'), task('d2'), task('d3'), task('d4'), task('d5'), task('o1'), task('d6')]
    const { elided, breaks } = elision([section('s', list)], new Map([['o1', card()]]))
    expect([...elided.keys()]).toEqual(['d1', 'n1', 'd2'])
    expect([...breaks]).toEqual(['d3'])
    expect(elided.get('d1')).toBe('d3')
  })

  test('four or fewer closed tasks elide nothing: a break must hide at least two rows', () => {
    const three = [task('d1'), task('d2'), task('d3'), task('o1')]
    expect(elision(three, new Map([['o1', card()]])).elided.size).toBe(0)
    const four = [task('d1'), task('d2'), task('d3'), task('d4'), task('o1')]
    expect(elision(four, new Map([['o1', card()]])).elided.size).toBe(0)
  })

  test('the style hides elided blocks, never a finished section’s, and never names storage', () => {
    const css = threadStyle(threadModel(input([section('s', [task('a')])], {})), new Set(['x']), new Set(['y']))
    expect(css).toContain('[data-id="x"]{display:none}')
    expect(css).toContain('[data-id="y"]{padding-block-start')
    expect(css).not.toContain('.bn-block-group{display:none}')
    expect(css).not.toContain('toggle-')
  })

  test('ticking a task never elides it until the page is opened again', () => {
    const blocks = [task('a'), task('b'), task('c'), task('d'), task('e'), task('o')]
    const open = new Map([['a', card()], ['b', card()], ['c', card()], ['d', card()], ['e', card()], ['o', card()]])
    const frozen: { current: FrozenElision | null } = { current: null }
    expect(freezeElision(frozen, blocks, open).elision.elided.size).toBe(0)
    expect(freezeElision(frozen, blocks, new Map([['o', card()]])).elision.elided.size).toBe(0)
    expect([...freezeElision({ current: null }, blocks, new Map([['o', card()]])).elision.elided.keys()]).toEqual(['a', 'b'])
  })
})

describe('AC-1514: the rail is drawn in the done colour from the first completed task to the first open task', () => {
  const progressOf = (blocks: ThreadBlock[], open: Record<string, ThreadTask>, over: Partial<ThreadInput> = {}): [string, string][] =>
    [...threadModel(input(blocks, open, over)).progress]

  test('nothing done, or no tasks at all: nothing is coloured', () => {
    expect(progressOf([task('o1'), task('o2')], { o1: card(), o2: card() })).toEqual([])
    expect(progressOf([note('n1'), section('s', [note('n2')])], {})).toEqual([])
    // A task done only after the first open one colours nothing either.
    expect(progressOf([task('o1'), task('d1')], { o1: card() })).toEqual([])
  })

  test('done then open: from the first done task to the first open one, across sections, and nothing after', () => {
    const blocks = [
      section('s1', [note('intro'), task('d1'), note('n1'), task('d2')]),
      section('s2', [task('d3'), task('o1'), task('d4'), task('o2')]),
      section('s3', [task('o3')]),
    ]
    // The frontier is the project's: another member's task stops it too.
    expect(progressOf(blocks, { o1: card({ assignee: { id: 'sara' } }), o2: card(), o3: card() }, { shared: true })).toEqual([
      ['d1', 'done-start'], ['n1', 'done'], ['d2', 'done'], ['s2', 'done'], ['d3', 'done'], ['o1', 'done-frontier'],
    ])
  })

  test('a dropped task never starts the stretch, but the stretch runs through one', () => {
    const blocks = [task('dropped'), task('d1'), task('dropped2'), task('o1')]
    const open = { dropped: card({ status: 'abandoned' }), dropped2: card({ status: 'abandoned' }), o1: card() }
    expect(progressOf(blocks, open)).toEqual([['d1', 'done-start'], ['dropped2', 'done'], ['o1', 'done-frontier']])
  })

  test('everything done: the stretch ends on the last task', () => {
    const blocks = [task('d1'), note('n1'), task('d2'), note('after')]
    expect(progressOf(blocks, {})).toEqual([['d1', 'done-start'], ['n1', 'done'], ['d2', 'done-frontier']])
  })

  test('everything done inside sections: what follows the last task in a green section covers its green', () => {
    const blocks = [section('s1', [task('d1')]), section('s2', [task('d2'), note('after')]), note('outside')]
    const model = threadModel(input(blocks, {}))
    expect([...model.progress]).toEqual([['d1', 'done-start'], ['s2', 'done'], ['d2', 'done-frontier']])
    expect([...model.line]).toEqual([['d2', 'covered'], ['after', 'covered']])
  })

  test('a hidden start hands the start to its "Earlier work" break, green over its whole length', () => {
    const blocks = [task('d1'), task('d2'), task('d3'), task('d4'), task('d5'), task('o1')]
    const elided = new Map([['d1', 'd3'], ['d2', 'd3']])
    expect(progressOf(blocks, { o1: card() }, { elided })).toEqual([['d3', 'done'], ['d4', 'done'], ['d5', 'done'], ['o1', 'done-frontier']])
    // The green runs past the label: only a break off the stretch cuts its line.
    const css = threadStyle(threadModel(input(blocks, { o1: card() }, { elided })), new Set(['d1', 'd2']), new Set(['d3']))
    expect(css).toContain('[data-id="d3"]{padding-block-start:var(--row-height);--dana-thread-knee:calc(var(--row-height) + var(--dana-thread-center))}')
  })

  test('the style draws the stretch over each block’s own grey line, and the stop only to its badge', () => {
    const model = threadModel(input([task('d1'), task('d2'), task('o1'), task('o2')], { o1: card(), o2: card() }))
    const css = threadStyle(model, new Set(), new Set())
    expect(css).toContain('[data-id="d1"]{--dana-thread-line:var(--dana-thread-done-start);--dana-thread-under:var(--dana-thread-solid);--dana-thread-fill:100%}')
    expect(css).toContain('[data-id="o1"]{--dana-thread-line:var(--dana-thread-done-frontier);--dana-thread-under:var(--dana-thread-frontier);--dana-thread-fill:var(--dana-thread-knee)}')
    expect(css).toContain('[data-id="o2"]{--dana-thread-line:var(--dana-thread-dashed)}')
  })
})
