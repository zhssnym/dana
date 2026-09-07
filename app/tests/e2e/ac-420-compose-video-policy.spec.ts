/*
AC-420: #184's production folder canvas renders the two video providers #177
approved in a real browser, while a direct media URL stays an ordinary link.
The response header and the browser's own CSP event stream are both observed:
DOM shape alone would pass if the iframe had been inserted and then refused.

Spec: 9.6, 10.8.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  caseTitle,
  createFolder,
  csrfToken,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

interface ItemRef {
  kind: 'block' | 'task'
  id: string
}

interface PageResult {
  items: ItemRef[]
}

interface CspViolation {
  directive: string
  blockedURI: string
}

async function watchCspViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const view = globalThis as unknown as {
      __composeCspViolations?: CspViolation[]
      addEventListener: (type: string, listener: (event: unknown) => void) => void
    }
    const seen: CspViolation[] = []
    view.__composeCspViolations = seen
    view.addEventListener('securitypolicyviolation', (event: unknown) => {
      const report = event as {
        effectiveDirective?: string
        violatedDirective?: string
        blockedURI?: string
      }
      seen.push({
        directive: report.effectiveDirective ?? report.violatedDirective ?? '',
        blockedURI: report.blockedURI ?? '',
      })
    })
  })
}

async function insertParagraph(
  page: Page,
  folderId: string,
  text: string,
  after: ItemRef | null,
): Promise<PageResult> {
  const token = await csrfToken(page.context())
  const response = await page.request.post(`/api/v1/folders/${folderId}/page/actions`, {
    data: {
      action: 'insert_block',
      block_kind: 'paragraph',
      text,
      section_block_id: null,
      after,
      before: null,
    },
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    response.status(),
    `POST /folders/:id/page/actions answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  return (await response.json()) as PageResult
}

test('AC-420: approved video frames load under CSP and direct media remains a link', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  const folderName = caseTitle('AC-420 video policy')
  const folder = await createFolder(page, folderName)
  let result = await insertParagraph(
    page,
    folder.id,
    'YouTube https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    null,
  )
  result = await insertParagraph(
    page,
    folder.id,
    'Vimeo https://vimeo.com/76979871',
    result.items.at(-1) ?? null,
  )
  await insertParagraph(
    page,
    folder.id,
    'Direct https://example.test/video.mp4',
    result.items.at(-1) ?? null,
  )

  await watchCspViolations(page)
  await page.route(/^https:\/\/(?:www\.youtube-nocookie\.com|player\.vimeo\.com)\//u, async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>frame</title>' })
  })
  /* This checkout lives below a `.codex` path segment. Express deliberately
     refuses `sendFile` fallbacks across dot segments (AC-402 records that
     environment edge), so enter through the static root and use Dana's own
     client-side folder link. The resulting folder page is still the built
     production bundle and never goes through Vite. */
  const response = await page.goto('/')
  expect(response, 'the production folder document answers').not.toBeNull()
  const csp = response?.headers()['content-security-policy'] ?? ''
  expect(csp.split(';').map((part) => part.trim())).toContain(
    'frame-src https://www.youtube-nocookie.com https://player.vimeo.com',
  )
  await page.evaluate((path) => {
    const view = globalThis as unknown as {
      history: { pushState: (state: unknown, unused: string, url: string) => void }
      dispatchEvent: (event: unknown) => void
      PopStateEvent: new (type: string, init: { state: unknown }) => unknown
    }
    view.history.pushState({}, '', path)
    view.dispatchEvent(new view.PopStateEvent('popstate', { state: {} }))
  }, routesV2.desk)
  await page.getByRole('link', { name: folderName, exact: true }).click()
  await expect(page).toHaveURL(routesV2.folder(folder.id))

  await expect(page.getByTitle('YouTube video')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  )
  await expect(page.getByTitle('Vimeo video')).toHaveAttribute(
    'src',
    'https://player.vimeo.com/video/76979871',
  )
  await expect(page.getByRole('link', { name: 'https://example.test/video.mp4' })).toHaveAttribute(
    'href',
    'https://example.test/video.mp4',
  )
  await expect(page.locator('video')).toHaveCount(0)

  const violations = await page.evaluate(
    () => (globalThis as unknown as { __composeCspViolations?: CspViolation[] })
      .__composeCspViolations ?? [],
  )
  expect(
    violations.filter((violation) => violation.directive.startsWith('frame-src')),
    'the real browser reports no frame-src refusal for either approved player',
  ).toEqual([])
})
