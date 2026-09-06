/* AC-421: #177's ruling applied to #184. The browser may frame only the
 * privacy-enhanced YouTube player and Vimeo; direct media remains a link and
 * therefore needs no new media host. Spec 10.8. */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'

let app: AuthTestApp

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) !== undefined) await app.close()
})

describe('AC-421 the composer CSP admits exactly the ruled video frames', () => {
  test('the response policy has the two frame sources and no broad wildcard', async () => {
    const response = await app.browser().request('/api/health')
    const csp = String(response.headers['content-security-policy'] ?? '')
    const frame = csp
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('frame-src '))
    expect(frame).toBe(
      'frame-src https://www.youtube-nocookie.com https://player.vimeo.com',
    )
    expect(csp).not.toContain('media-src *')
  })
})
