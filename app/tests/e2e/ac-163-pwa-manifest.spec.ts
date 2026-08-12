/*
AC-163: given the installed application's manifest, then it names
Dana, displays standalone, starts at /app, and carries fetchable 192 and 512
icons with a theme and a background color.

Numbered by the Integration Steward at P8's mid-package change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged, the AC-125 to AC-130, AC-133 to AC-140 and AC-142
precedent for a batch authored on the branch and numbered additively so
nothing already written moves.

10.6's first sentence is a list of five manifest facts and section 12 reaches
none of them. AC-091 and AC-100 cover the service worker's two behaviors and
stop there, which leaves the half of 10.6 that decides whether Dana can be
installed at all asserted by nothing. Every one of the five fails silently:
a wrong start_url opens the installed app somewhere the person did not
expect, a missing display makes it a browser tab with a bookmark, and an
icon that 404s is an installed application with a blank square for a name.

**start_url is the fact with a second reader.** 9.1's route table records
that My Day is /app rather than /app/my-day precisely because 10.6 fixes
start_url there and a separate path would leave the installed app opening on
a redirect. So this is not only a manifest key; it is the reason one of the
ten routes is spelled the way it is, and the two have to agree.

**The icons are fetched rather than read.** A manifest that lists them and a
build that ships them are different claims, and the 11.13 note that the icons
arrive as committed PNG files with the design artifacts is exactly the
circumstance in which a listed icon has no file behind it.

This is the one file in this leg that reads markup: a manifest is reached
through `<link rel="manifest">` and there is no accessible role for it,
which is a web platform fact rather than an implementation choice. Nothing
else here addresses anything that way.

Spec: 10.6 (the manifest), 9.1's route table (why start_url and My Day
agree), 11.13 (the icons as committed artifacts), 11.4.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  routes,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

interface Manifest {
  name?: string
  display?: string
  start_url?: string
  theme_color?: string
  background_color?: string
  icons?: { src: string; sizes?: string }[]
}

test.describe('AC-163: the PWA manifest of 10.6', () => {
  test('AC-163: the manifest names Dana, stands alone and starts at /app', async ({
    page,
  }) => {
    await page.goto(routes.myDay)

    const link = page.locator('link[rel="manifest"]')
    await expect(
      link,
      'spec 10.6: an installable application links its manifest from the document, and there is ' +
        'exactly one to link',
    ).toHaveCount(1)
    const href = await link.first().getAttribute('href')
    expect(
      href,
      'spec 10.6: an installable application links its manifest from the document. There is ' +
        'no accessible role for one, which is why this is the only assertion in this leg that ' +
        'reads markup',
    ).not.toBeNull()

    const response = await page.request.get(new URL(href as string, page.url()).toString())
    expect(
      response.status(),
      `the manifest answered ${response.status()}, so nothing below can be read from it`,
    ).toBe(200)
    const manifest = (await response.json()) as Manifest

    expect(manifest.name, 'spec 10.6: name Dana').toBe('Dana')
    expect(
      manifest.display,
      'spec 10.6: display standalone. Without it an installed Dana is a browser tab with a ' +
        'bookmark',
    ).toBe('standalone')
    expect(
      new URL(manifest.start_url ?? '', page.url()).pathname,
      'spec 10.6: start_url /app. 9.1\'s route table records that My Day is /app rather than ' +
        '/app/my-day for this reason, so that the installed app does not open on a redirect; ' +
        'the two have to agree and this is where they are compared',
    ).toBe(routes.myDay)

    expect(
      typeof manifest.theme_color === 'string' && manifest.theme_color !== '',
      'spec 10.6: theme and background colors are design\'s choice, which is a choice that ' +
        'has to be made rather than one that can be skipped. The value is not asserted; its ' +
        'presence is',
    ).toBe(true)
    expect(
      typeof manifest.background_color === 'string' && manifest.background_color !== '',
      'spec 10.6: the background color is set',
    ).toBe(true)
  })

  test('AC-163: the 192 and 512 icons exist and are fetchable', async ({ page }) => {
    await page.goto(routes.myDay)
    const link = page.locator('link[rel="manifest"]')
    await expect(
      link,
      'spec 10.6: the manifest is linked from the document, which is where its icons are read ' +
        'from',
    ).toHaveCount(1)
    const href = await link.first().getAttribute('href')
    const manifestUrl = new URL(href ?? '/manifest.webmanifest', page.url()).toString()
    const manifest = (await (await page.request.get(manifestUrl)).json()) as Manifest
    const icons = manifest.icons ?? []

    for (const size of ['192x192', '512x512']) {
      const icon = icons.find((entry) => entry.sizes?.includes(size) === true)
      expect(
        icon,
        `spec 10.6: icons 192 and 512. The manifest lists ${JSON.stringify(
          icons.map((entry) => entry.sizes),
        )}`,
      ).toBeDefined()
      if (icon === undefined) throw new Error('unreachable: asserted defined above')

      const file = await page.request.get(new URL(icon.src, manifestUrl).toString())
      expect(
        file.status(),
        'spec 10.6 and 11.13: the icons are committed files, so a listed icon with nothing ' +
          'behind it installs an application with a blank square where its name should be. ' +
          'Listing and shipping are different claims and this is the one that matters',
      ).toBe(200)
    }
  })
})
