/*
Format 4 has a decision recorded for every block kind a page can hold, and its
block rules say the same thing `documentOperation` says.

**Why a guard rather than a criterion.** Neither of these is a behaviour anybody
asked for; both are statements about the shape of two schemas that have to agree
because one is built from the other. A criterion that drove them through the
endpoint would be asserting an implementation detail at the cost of a database
round trip, and would not fire on the case that matters — a kind added on
another branch, which no fixture in this repository mentions yet.

**The case that matters, stated plainly.** `DOCUMENT_BLOCK_KINDS` is the list of
kinds a folder page may hold, and it grows: #219 added six, #220 adds `file`,
`audio` and `video` on a branch open beside #185. A workflow file has to have an
answer for each — carried whole, or written as an explicit placeholder — and the
failure mode of *not* having one is the quiet kind. A new kind that nobody
listed would meet `z.discriminatedUnion`'s "Invalid discriminator value" on the
way in, which is correct, and would be **silently dropped from every export**
on the way out, because `folderToWorkflowFile` writes what it recognises. A
person would save a page holding one and get a file with a gap and no
placeholder — which is the exact defect issue #185 exists to end, wearing a
different kind.

So the first test fails by name on a kind that is in neither list, and the
second fails if a block format 4 accepts turns into a `put_block`
`documentOperation` would refuse, or the other way about.
*/
import { describe, expect, test } from 'vitest'

import {
  DOCUMENT_BLOCK_KINDS,
  documentOperation,
} from '../../src/shared/page-document.js'
import {
  WORKFLOW_OMITTED_BLOCK_KINDS,
  WORKFLOW_PAGE_BLOCK_KINDS,
  workflowPageBlock,
} from '../../src/shared/workflows.js'

describe('format 4 has an answer for every block kind a page can hold (#185)', () => {
  test('every kind is either carried or written as a placeholder', () => {
    const answered = new Set<string>([
      ...WORKFLOW_PAGE_BLOCK_KINDS,
      ...WORKFLOW_OMITTED_BLOCK_KINDS,
    ])
    expect(
      DOCUMENT_BLOCK_KINDS.filter((kind) => !answered.has(kind)),
      'a folder page can hold these kinds and a workflow file says nothing about them. ' +
        'Decide: add the kind to WORKFLOW_PAGE_BLOCK_KINDS if a file can carry it whole, ' +
        'or to WORKFLOW_OMITTED_BLOCK_KINDS if it names a row of the exporting account. ' +
        'Leaving it out is not neutral — the export drops it with no placeholder, which is ' +
        'the silent loss #185 was opened about',
    ).toEqual([])
  })

  /*
  The other direction is deliberately **not** asserted. `WORKFLOW_OMITTED_BLOCK_KINDS`
  names `file`, `audio` and `video` before this tree has them, on the reasoning in
  `shared/workflows.ts`: they arrive with #220 and a list written to be completed
  later is one that is silently incomplete on the day the other branch merges.
  Naming a kind that does not exist yet costs nothing — a placeholder for it is
  never written, because no page holds one — and the test above is what makes the
  claim checkable the moment it does exist.
  */
  test('no kind is in both lists', () => {
    const omitted = new Set<string>(WORKFLOW_OMITTED_BLOCK_KINDS)
    expect(
      WORKFLOW_PAGE_BLOCK_KINDS.filter((kind) => omitted.has(kind)),
      'a kind cannot be both carried and dropped; the discriminated union would have two branches for it',
    ).toEqual([])
  })
})

/**
 * A format 4 content block as the import turns it into a `put_block`. The same
 * six lines `importWorkflow` uses, which is what makes the agreement below a
 * check on the schemas rather than on this file.
 */
function asPutBlock(block: Record<string, unknown>): unknown {
  return {
    op: 'put_block',
    id: '00000000-0000-4000-8000-000000000001',
    block_kind: block.kind,
    text: block.text ?? null,
    rich_content: block.rich_content ?? null,
    file_id: null,
    ref_folder_id: null,
    width_pct: null,
    checked: block.kind === 'checklist' ? (block.checked ?? false) : null,
  }
}

describe('format 4 judges a block exactly as the document contract does (#185)', () => {
  /*
  The three rules a block's own payload carries, over the kinds that can break
  each: a heading's 120 characters, rich content only on the kinds that admit it
  and only when it matches the text, and a tick only on a checklist item.

  `shared/workflows.ts` restates these over the constants `page-document.ts`
  owns, because a format 4 block is not a `put_block` — it has no id, no
  `file_id` and no `width_pct` — and is turned into one only after the workflow
  schema has accepted it. This is what holds the restatement honest.
  */
  const probes: [string, Record<string, unknown>][] = [
    ['a heading within its limit', { kind: 'section', text: 'x'.repeat(120) }],
    ['a heading over it', { kind: 'section', text: 'x'.repeat(121) }],
    ['a paragraph at the text limit', { kind: 'paragraph', text: 'x'.repeat(4000) }],
    ['a paragraph over it', { kind: 'paragraph', text: 'x'.repeat(4001) }],
    [
      'rich content that matches its projection',
      {
        kind: 'paragraph',
        text: 'hello there',
        rich_content: { version: 1, runs: [{ text: 'hello ', bold: true }, { text: 'there' }] },
      },
    ],
    [
      'rich content that does not',
      {
        kind: 'paragraph',
        text: 'hello there',
        rich_content: { version: 1, runs: [{ text: 'goodbye' }] },
      },
    ],
    [
      'rich content on a code block, which carries none',
      {
        kind: 'code',
        text: 'npm run gate',
        rich_content: { version: 1, runs: [{ text: 'npm run gate' }] },
      },
    ],
    ['a tick on a checklist item', { kind: 'checklist', text: 'count the chairs', checked: true }],
    ['a tick on a quote', { kind: 'quote', text: 'count the chairs', checked: true }],
  ]

  /*
  **One direction, and the asymmetry is intended rather than tolerated.**

  What must never happen is a block format 4 accepts that the document contract
  refuses: the import would have passed the schema, built a transaction and met
  a validation error with nowhere to put it. That is what this asserts.

  The other way round is a case this format is *deliberately* stricter about,
  and the probe list holds one on purpose — `checked: true` on a quote. The
  conversion drops a tick that does not belong to a checklist item, so the
  `put_block` it makes is perfectly legal; format 4 refuses the file instead,
  because a key the import would drop is the file claiming something it does
  not get, which is the rule issue #185 is about. A guard that demanded lockstep
  would be arguing with that decision.
  */
  test('every block format 4 accepts is one the document contract accepts', () => {
    const unbuildable = probes.flatMap(([what, block]) =>
      workflowPageBlock.safeParse(block).success &&
      !documentOperation.safeParse(asPutBlock(block)).success
        ? [what]
        : [],
    )
    expect(
      unbuildable,
      'format 4 accepts these and applyDocument cannot be handed the block they become, ' +
        'so the import would answer a validation failure for a file the schema passed — ' +
        'a 500 in the making. Tighten the format 4 rule in shared/workflows.ts to match ' +
        'the put_block rule it restates',
    ).toEqual([])
  })

  test('and the probes exercise both answers, so the check above is not vacuous', () => {
    const accepted = probes.filter(([, block]) => workflowPageBlock.safeParse(block).success)
    expect(accepted.length, 'some probe must be accepted').toBeGreaterThan(0)
    expect(
      accepted.length,
      'and some probe must be refused, or this file proves only that nothing was tested',
    ).toBeLessThan(probes.length)
  })
})
