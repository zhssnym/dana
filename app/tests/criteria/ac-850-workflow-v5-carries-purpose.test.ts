/*
AC-850: workflow format 5 carries native Purpose as portable authored context,
while versions 1-4 remain readable. Purpose media is explicit omitted content,
not an inaccessible file id; import writes the fresh Folder's native Purpose
with fresh block identities and preserves authored Dana hrefs without granting
anything.

Issue #211 R3; Hassan ruling:
https://github.com/zhssnym/dana/issues/211#issuecomment-5801396721
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { PageBlock, PageView } from '../../src/shared/pages.js'
import {
  WORKFLOW_FILE_VERSIONS,
  folderToWorkflowFile,
  importWorkflowBody,
} from '../../src/shared/workflows.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { importWorkflowOk } from '../support/label-lifecycle-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac850')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

const block = (
  id: string,
  kind: PageBlock['kind'],
  text: string | null,
  listParent: string | null = null,
): PageBlock => ({
  id,
  kind,
  position: 0,
  page_position: 'a0',
  section_block_id: null,
  list_parent_block_id: listParent,
  checked: kind === 'checklist' ? true : null,
  rich_content:
    kind === 'paragraph' && text !== null
      ? { version: 1, runs: [{ text, href: '/app/folders/00000000-0000-4000-8000-000000000850' }] }
      : null,
  text,
  file_id:
    kind === 'image' ? '00000000-0000-4000-8000-00000000085f' : null,
  file_width: null,
  file_height: null,
  ref_folder_id: null,
  width_pct: null,
  updated_at: '2026-09-23T12:00:00.000Z',
})

describe('AC-850 workflow v5 carries Purpose deliberately', () => {
  test('the writer emits v5 only with Purpose and records media omission explicitly', () => {
    const main: PageView = { revision: 'main', blocks: [], items: [], task_placements: [] }
    const h1 = block('00000000-0000-4000-8000-000000000851', 'heading1', 'Intent')
    const parent = block('00000000-0000-4000-8000-000000000852', 'bullet', 'First')
    const child = block(
      '00000000-0000-4000-8000-000000000853',
      'checklist',
      'Second',
      parent.id,
    )
    const prose = block(
      '00000000-0000-4000-8000-000000000854',
      'paragraph',
      'Keep this link authored',
    )
    const image = block('00000000-0000-4000-8000-000000000855', 'image', null)
    const purposePage: PageView = {
      revision: 'purpose',
      blocks: [h1, parent, child, prose, image],
      items: [h1, parent, child, prose, image].map((row) => ({
        kind: 'block' as const,
        id: row.id,
      })),
      task_placements: [],
    }

    const old = folderToWorkflowFile('Portable', [], [], main)
    expect(old.file.version, 'existing callers still write the pre-Purpose format').toBe(4)

    const made = folderToWorkflowFile(
      'Portable',
      [],
      [],
      main,
      [],
      { display_name: 'Why', page: purposePage },
    )
    expect(made.file.version).toBe(5)
    expect(made.omitted, 'the image is recorded as an omission').toBe(1)
    const parsed = importWorkflowBody.safeParse(
      JSON.parse(JSON.stringify(made.file)),
    )
    expect(parsed.success, 'the v5 writer is read by the same contract').toBe(true)
    if (!parsed.success) return
    const purpose = parsed.data.folders[0]?.purpose
    expect(purpose?.display_name).toBe('Why')
    expect(purpose?.blocks.map((each) => each.kind)).toEqual([
      'heading1',
      'bullet',
      'checklist',
      'paragraph',
      'omitted',
    ])
    expect(
      purpose?.blocks[2],
      'the checklist remains authored state nested under the preceding list item',
    ).toMatchObject({ kind: 'checklist', checked: true, list_parent: 1 })
    expect(
      purpose?.blocks[3],
      'a Dana href is authored content in a workflow, not an account-local id remap',
    ).toMatchObject({
      kind: 'paragraph',
      rich_content: {
        version: 1,
        runs: [
          {
            text: 'Keep this link authored',
            href: '/app/folders/00000000-0000-4000-8000-000000000850',
          },
        ],
      },
    })
    expect(purpose?.blocks[4]).toEqual({ kind: 'omitted', was: 'image' })
  })

  test('v5 import writes the fresh native Purpose and v1-v4 remain readable', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    for (const version of [1, 2, 3, 4] as const) {
      expect(
        importWorkflowBody.safeParse({
          dana: 'workflow',
          version,
          folders: [{ name: `AC-850 legacy ${String(version)}` }],
        }).success,
        `workflow v${String(version)} remains readable`,
      ).toBe(true)
    }
    expect(WORKFLOW_FILE_VERSIONS).toContain(5)

    const href = '/app/folders/00000000-0000-4000-8000-000000000850'
    const file = {
      dana: 'workflow',
      version: 5,
      folders: [
        {
          name: 'AC-850 imported',
          purpose: {
            display_name: 'Intent',
            blocks: [
              { kind: 'heading2', text: 'Boundary' },
              { kind: 'bullet', text: 'Parent' },
              { kind: 'numbered', text: 'Child', list_parent: 1 },
              {
                kind: 'paragraph',
                text: 'Reference',
                rich_content: {
                  version: 1,
                  runs: [{ text: 'Reference', href }],
                },
              },
              { kind: 'omitted', was: 'image' },
            ],
          },
        },
      ],
    }
    const [created] = await importWorkflowOk(owner, file)
    expect(created).toBeDefined()

    const purpose = await rows(
      app.db,
      sql`SELECT id, display_name FROM folder_facets
            WHERE folder_id=${created!.id}::uuid AND kind='purpose'`,
    )
    expect(purpose).toHaveLength(1)
    expect(purpose[0]?.display_name).toBe('Intent')
    const blocks = await rows(
      app.db,
      sql`SELECT id, kind, list_parent_block_id, rich_content
            FROM page_blocks
            WHERE facet_id=${String(purpose[0]?.id)}::uuid
            ORDER BY position ASC`,
    )
    expect(blocks.map((row) => String(row.kind))).toEqual([
      'heading2',
      'bullet',
      'numbered',
      'paragraph',
    ])
    expect(String(blocks[2]?.list_parent_block_id)).toBe(String(blocks[1]?.id))
    expect(
      (blocks[3]?.rich_content as { runs: { href?: string }[] }).runs[0]?.href,
      'import preserves the authored href and grants nothing merely by containing it',
    ).toBe(href)
  })
})
