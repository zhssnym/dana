/*
AC-505: given one folder page holding #218's headings, #219's structured
writing and #220's four media kinds together, then every kind saves, reloads
as itself, and keeps the state that belongs to it — a heading's depth, a
nested list item's two parents, a checklist item's tick, and a media block's
file reference — with none of them bleeding into another.

Issue #220, proof 18. The issue's list asks that "#218/#219 document tests
remain passing", and those files do pass, unchanged, on this branch. This
criterion is the thing that list does not ask for and is worth more: the three
vocabularies in **one document at once**.

The reason is that they share one table, one `put_block` schema, one outline
and one validator. Each family's own criteria write a page holding only that
family, so a rule that leaked across families — a media kind admitted into
list nesting, a `checked` surviving onto an audio block, a heading depth
counted through a video — is invisible to all of them and to this issue's
required list. Each assertion below is a negative that none of the three
families' own files can make.

Spec: 4.17, 7.16.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { DocumentOperation, PageView } from '../../src/shared/pages.js'
import {
  MP3_BYTES,
  MP4_BYTES,
  ZIP_BYTES,
  uploadImageOk,
  uploadKindOk,
} from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac505')
beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)
afterAll(async () => {
  if (app) {
    await cast.cleanup(app.db)
    await app.close()
  }
})

async function read(owner: Actor, folder: string): Promise<PageView> {
  const response = await owner.browser.json(`/folders/${folder}/page`, 'GET')
  expectStatus(response, 200, 'page read')
  return response.json() as PageView
}

test('AC-505 headings, structured writing and media coexist in one document', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac505 one document, three vocabularies')

  const imageId = await uploadImageOk(owner, folder, 'ac505.png')
  const fileId = await uploadKindOk(owner, 'file', folder, {
    name: 'ac505.q4data',
    type: 'application/octet-stream',
    bytes: ZIP_BYTES,
  })
  const audioId = await uploadKindOk(owner, 'audio', folder, {
    name: 'ac505.mp3',
    type: 'audio/mpeg',
    bytes: MP3_BYTES,
  })
  const videoId = await uploadKindOk(owner, 'video', folder, {
    name: 'ac505.mp4',
    type: 'video/mp4',
    bytes: MP4_BYTES,
  })

  const h1 = randomUUID()
  const bullet = randomUUID()
  const checklist = randomUUID()
  const quote = randomUUID()
  const code = randomUUID()
  const image = randomUUID()
  const file = randomUUID()
  const audio = randomUUID()
  const video = randomUUID()

  const put = (
    id: string,
    kind: string,
    extra: Record<string, unknown> = {},
  ): DocumentOperation =>
    ({
      op: 'put_block',
      id,
      block_kind: kind,
      text: null,
      rich_content: null,
      file_id: null,
      ref_folder_id: null,
      width_pct: null,
      checked: null,
      ...extra,
    }) as DocumentOperation

  const before = await read(owner, folder)
  const status = await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: before.revision!,
    operations: [
      put(h1, 'section', { text: 'Assets' }),
      put(bullet, 'bullet', { text: 'a bullet' }),
      put(checklist, 'checklist', { text: 'a tick', checked: true }),
      put(quote, 'quote', { text: 'a quotation' }),
      put(code, 'code', { text: 'const answer = 42' }),
      put(image, 'image', { file_id: imageId, width_pct: 50 }),
      put(file, 'file', { file_id: fileId }),
      put(audio, 'audio', { file_id: audioId }),
      put(video, 'video', { file_id: videoId, width_pct: 65 }),
      {
        op: 'set_outline',
        items: [
          { kind: 'block', id: h1, section_block_id: null, list_parent_block_id: null },
          { kind: 'block', id: bullet, section_block_id: h1, list_parent_block_id: null },
          { kind: 'block', id: checklist, section_block_id: h1, list_parent_block_id: bullet },
          { kind: 'block', id: quote, section_block_id: h1, list_parent_block_id: null },
          { kind: 'block', id: code, section_block_id: h1, list_parent_block_id: null },
          { kind: 'block', id: image, section_block_id: h1, list_parent_block_id: null },
          { kind: 'block', id: file, section_block_id: h1, list_parent_block_id: null },
          { kind: 'block', id: audio, section_block_id: h1, list_parent_block_id: null },
          { kind: 'block', id: video, section_block_id: h1, list_parent_block_id: null },
        ],
      },
    ],
  })
  expectStatus(status, 200, 'all three vocabularies land in one transaction')

  const stored = await read(owner, folder)
  const by = (id: string) => stored.blocks.find((block) => block.id === id)

  // #218: a Section, and the media blocks inside it are its content.
  expect(by(h1)?.kind).toBe('section')
  for (const id of [bullet, checklist, quote, code, image, file, audio, video]) {
    expect(by(id)?.section_block_id, 'everything sits in the Section').toBe(h1)
  }

  // #219: the two parents stay independent, and the tick stays where it is.
  expect(by(checklist)?.list_parent_block_id, 'the nested item keeps its list parent').toBe(bullet)
  expect(by(checklist)?.checked).toBe(true)
  expect(by(bullet)?.list_parent_block_id).toBeNull()

  // #220: four media kinds, each with its own file and nothing of another's.
  expect(by(image)?.kind).toBe('image')
  expect(by(file)?.kind).toBe('file')
  expect(by(audio)?.kind).toBe('audio')
  expect(by(video)?.kind).toBe('video')
  expect(by(file)?.file_id).toBe(fileId)
  expect(by(audio)?.file_id).toBe(audioId)
  expect(by(video)?.file_id).toBe(videoId)

  /* The negatives, which are the point of writing all three into one page.
     No media block picked up a tick, none picked up list parentage, and the
     structured text blocks picked up no file. */
  expect(
    stored.blocks.filter((block) => block.checked !== null).map((block) => block.kind),
    'only a checklist item records a tick, whatever else is on the page',
  ).toEqual(['checklist'])
  expect(
    stored.blocks
      .filter((block) => block.list_parent_block_id !== null)
      .map((block) => block.kind),
    'only a list kind takes part in list nesting',
  ).toEqual(['checklist'])
  expect(
    stored.blocks.filter((block) => block.file_id !== null).map((block) => block.kind).sort(),
    'only a media kind carries a file',
  ).toEqual(['audio', 'file', 'image', 'video'])
  expect(
    stored.blocks.filter((block) => block.width_pct !== null).map((block) => block.kind).sort(),
    'only an image and a video persist a width',
  ).toEqual(['image', 'video'])
})

test('AC-505 a media block may not be nested under a list item', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac505 media is not list content')
  const audioId = await uploadKindOk(owner, 'audio', folder, {
    name: 'nested.mp3',
    type: 'audio/mpeg',
    bytes: MP3_BYTES,
  })

  const bullet = randomUUID()
  const audio = randomUUID()
  const before = await read(owner, folder)
  /* #219 confines list nesting to bullet, numbered and checklist on both
     ends. #220 adds three kinds to the same table and to the same outline,
     and this is the case that says the confinement still holds — no file in
     either family's own criteria could see a kind the other family added. */
  const refused = await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: before.revision!,
    operations: [
      {
        op: 'put_block',
        id: bullet,
        block_kind: 'bullet',
        text: 'a bullet',
        rich_content: null,
        file_id: null,
        ref_folder_id: null,
        width_pct: null,
        checked: null,
      },
      {
        op: 'put_block',
        id: audio,
        block_kind: 'audio',
        text: null,
        rich_content: null,
        file_id: audioId,
        ref_folder_id: null,
        width_pct: null,
        checked: null,
      },
      {
        op: 'set_outline',
        items: [
          { kind: 'block', id: bullet, section_block_id: null, list_parent_block_id: null },
          { kind: 'block', id: audio, section_block_id: null, list_parent_block_id: bullet },
        ],
      },
    ],
  })
  expectStatus(refused, 422, 'only a bullet, numbered or checklist item nests (#219)')
  expect((await read(owner, folder)).revision, 'and nothing was written').toBe(before.revision)
})
