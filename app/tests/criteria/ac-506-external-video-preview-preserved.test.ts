/*
AC-506: given #220's backend contract, then the existing external-video
preview path is unchanged: YouTube and Vimeo URLs still resolve to their
embed origins, those two origins and no others are still the Content Security
Policy's `frame-src`, `media-src` still admits the blob and same-origin
sources a played media file needs, and no provider registry has appeared.

Issue #220, proof 19, and it is a criterion against a change rather than for
one. R1 is explicit in both directions: preserve YouTube and Vimeo, do not
build a general multi-provider embed platform, and defer broader rich embeds
to a future milestone.

**The negative half is the half worth having.** "Do not build a registry" is
the kind of instruction that is obeyed on the day and eroded afterwards, one
plausible provider at a time, each of which is a new origin in `frame-src` —
which is to say a new origin permitted to frame content inside Dana. So this
case pins the *exact* set rather than asserting the two are present, and a
third entry fails it and has to be argued for.

**`media-src` is here because #220 is the issue that made it load-bearing.**
Before this, the only thing it governed was a just-recorded voice note's
object URL. An `audio` or `video` block plays a file served from this origin,
so a policy that narrowed `media-src` would break inline playback silently —
which is the failure mode AC-238's own header records this project losing
months to, where a blocked resource and an absent one draw identically.

The CSP is read off the wire rather than off the module, so it is the policy
a browser would actually receive.

Spec: 10.8, and #220 R1's "External media URLs".
*/
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { videoTarget } from '../../src/client/pages/composer-research-content.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac506')
beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)
afterAll(async () => {
  if (app) {
    await cast.cleanup(app.db)
    await app.close()
  }
})

test('AC-506 the YouTube and Vimeo preview path still resolves, and still refuses the rest', async () => {
  expect(videoTarget('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toEqual({
    kind: 'youtube',
    src: 'https://www.youtube-nocookie.com/embed/jNQXAC9IVRw',
  })
  expect(videoTarget('https://youtu.be/jNQXAC9IVRw')).toEqual({
    kind: 'youtube',
    src: 'https://www.youtube-nocookie.com/embed/jNQXAC9IVRw',
  })
  expect(videoTarget('https://vimeo.com/76979871')).toEqual({
    kind: 'vimeo',
    src: 'https://player.vimeo.com/video/76979871',
  })
  /* And no registry: a third provider is not recognised, and a bare link is
     a link rather than an embed. R1 defers broader rich embeds explicitly. */
  expect(videoTarget('https://dailymotion.com/video/x8abcde')).toBeNull()
  expect(videoTarget('https://example.com/a-page-about-video')).toBeNull()
})

test('AC-506 frame-src is exactly the two providers, and media-src still serves a player', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const response = await owner.browser.request('/api/v1/me', { method: 'GET' })
  const policy = String(response.headers['content-security-policy'])

  const frameSrc = policy
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('frame-src'))
  expect(
    frameSrc,
    'frame-src is exactly YouTube-nocookie and Vimeo: a third origin is a new thing permitted to frame Dana and must be argued for, not added (#220 R1)',
  ).toBe('frame-src https://www.youtube-nocookie.com https://player.vimeo.com')

  const mediaSrc = policy
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('media-src'))
  expect(
    mediaSrc,
    "media-src admits this origin and blob:, which is what an audio or video block's inline player needs (10.8)",
  ).toBe("media-src 'self' blob:")
})
