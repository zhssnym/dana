/*
AC-293: given a folder, when any member PATCHes `cover_preset` and
`cover_focal_y`, then the Folder object answers both, a preset arriving
clears a stored file and a file arriving clears the preset (4.3's one-source
rule), a body naming both is 422, a crop outside 0 to 100 is 422, and the
folder's duplicate carries the preset and the crop.

Section 13 item 53 measured that a folder could wear an upload and nothing
else, and recommended mirroring 4.20's two columns onto `folders`; RFC 0005
change control item 58 (H) took the recommendation. AC-001 asserts the three
named CHECKs; this asserts the contract over them.

Spec: 4.3 and 7.4 (as widened by item 58), 7.16, 4.20.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { ONE_PIXEL_PNG, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'loose')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface FolderCover {
  cover_file_id: string | null
  cover_preset: string | null
  cover_focal_y: number
}

describe('AC-293 a folder wears a preset with a crop, or a file, never both', () => {
  test('a member sets a preset and a crop; a file then clears the preset; a preset then clears the file', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'loose ac293 dressed')
    await addMemberOk(owner, folderId, member.id)

    const preset = await member.browser.json(`/folders/${folderId}`, 'PATCH', {
      cover_preset: 'gradient-cobalt-deep',
      cover_focal_y: 30,
    })
    expectStatus(preset, 200, 'any member writes the 4.3 identity (spec 7.4)')
    let cover = preset.json() as FolderCover
    expect(cover.cover_preset, 'the preset is stored').toBe('gradient-cobalt-deep')
    expect(cover.cover_focal_y, 'and the crop with it').toBe(30)
    expect(cover.cover_file_id, 'no file').toBeNull()

    const landed = await upload(
      owner,
      '/files',
      { kind: 'cover', folder_id: folderId },
      { name: 'cover.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(landed, 201, 'a cover upload (spec 7.15)')
    const stored = landed.json() as { id: string }
    const filed = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      cover_file_id: stored.id,
    })
    expectStatus(filed, 200, 'a file cover (spec 7.4)')
    cover = filed.json() as FolderCover
    expect(cover.cover_file_id, 'the file is stored').toBe(stored.id)
    expect(cover.cover_preset, 'one source: the preset cleared').toBeNull()
    expect(cover.cover_focal_y, 'the crop is the cover\'s and stays until re-set').toBe(30)

    const back = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      cover_preset: 'mark-fern',
      cover_focal_y: 50,
    })
    expectStatus(back, 200, 'a preset again')
    cover = back.json() as FolderCover
    expect(cover.cover_preset).toBe('mark-fern')
    expect(cover.cover_file_id, 'one source: the file cleared').toBeNull()

    const both = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      cover_preset: 'gradient-ink',
      cover_file_id: stored.id,
    })
    expectStatus(both, 422, 'a body naming both sources is refused')
    const wide = await owner.browser.json(`/folders/${folderId}`, 'PATCH', { cover_focal_y: 101 })
    expectStatus(wide, 422, 'a crop outside 0 to 100 is refused')

    const copied = await owner.browser.json(`/folders/${folderId}/duplicate`, 'POST')
    expectStatus(copied, 201, 'the duplicate (spec 7.16)')
    const copyId = (copied.json() as { id: string }).id
    const read = await owner.browser.api(`/folders/${copyId}`)
    expectStatus(read, 200, 'the copy reads')
    const copy = read.json() as FolderCover
    expect(copy.cover_preset, 'the copy wears the same preset').toBe('mark-fern')
    expect(copy.cover_focal_y, 'and the same crop').toBe(50)
  })
})
