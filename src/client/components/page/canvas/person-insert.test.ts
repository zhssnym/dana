// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'
import { BlockNoteEditor } from '@blocknote/core'

import { documentOperation } from '../../../../shared/page-document.js'
import { dehydrateCanvas } from './adapters.js'
import { installCanvasGuard } from './guard.js'
import { canvasSchema } from './schema.js'
import { canvasSlashItems } from './slash-items.js'

test('Person inserts from the Work slash menu with the canvas guard active', () => {
  const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: [{ type: 'paragraph', content: '' }] })
  const explain = vi.fn()
  const stopGuard = installCanvasGuard(editor, explain)
  const person = canvasSlashItems(editor, { surface: 'work' }).find((item) => item.title === 'Person')
  expect(person).toBeDefined()
  person?.onItemClick()
  const inserted = editor.document.find((block) => block.type === 'person')
  expect(inserted).toBeDefined()
  editor.updateBlock(inserted!.id, { props: { userId: '33333333-3333-4333-8333-333333333333' } })
  const saved = dehydrateCanvas(editor.document, 600, new Map()).blocks.find((block) => block.id === inserted!.id)
  expect(saved?.block_kind).toBe('person')
  expect(documentOperation.safeParse({ op: 'put_block', ...saved }).success).toBe(true)
  expect(explain).not.toHaveBeenCalled()
  stopGuard()
  editor.unmount()
})
