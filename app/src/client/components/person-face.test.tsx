// @vitest-environment jsdom

/*
The first component test in this repository, and two notes worth reading before
you write the second one.

**How it renders at all.** `app/vitest.config.ts` runs the suite under
`environment: 'node'`, so until this file nothing here could render: `jsdom` and
`@testing-library` had been installed for weeks and imported by nothing, and
`lib/use-sortable-list.test.ts` said so in as many words. The client had
fourteen files testing pure functions and 109 Playwright specs eleven minutes
away, and nothing in between.

The docblock on line 1 is what buys it, and it is per file rather than in the
config on purpose: the other 277 files want `node`, and a global switch would
hand every server test a browser it never uses.

**Why this component.** `personDisplay` in `parts/presenters.ts` dropped
`avatar_url` on the floor until 2026-08-30, so a person wore their photograph on
a card and a coloured disc on the row beneath it: one seam, every list view in
the product, found by a human looking at the screen. That half now has a guard
in `presenters.test.ts`. This is the other half, the component that decides disc
or picture, and together they close the loop the bug travelled through.
*/

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'

import { PersonFace } from './person-face.js'

/*
**Read this before testing any component that shows an image.**

`Avatar` does not put an `<img>` in the tree until the image reports that it
loaded, and jsdom never loads anything: it parses `src` and stops. So a naive
`getByRole('img')` finds nothing, the fallback is all that renders, and the test
looks like the component is broken when it is behaving exactly as designed.

This teaches the stub that an image assigned a `src` finishes loading, which is
what a browser would do. Without it the two picture cases below cannot be
written at all.
*/
beforeAll(() => {
  Object.defineProperty(globalThis.Image.prototype, 'src', {
    set(this: HTMLImageElement, value: string) {
      this.setAttribute('src', value)
      setTimeout(() => this.dispatchEvent(new Event('load')))
    },
  })
})

/*
Testing Library unmounts between tests only when vitest runs with
`globals: true`, and this config does not set it. Without this line the second
render's markup is still in the document when the third one runs, and a query
that should find one element finds two. The error says "Found multiple
elements", which reads like a component bug and is not one.
*/
afterEach(cleanup)

const picture = 'https://example.test/sara.jpg'
const face = (): HTMLElement => screen.getByRole('presentation', { hidden: true })

describe('PersonFace: the picture is the default and the initials are the fallback', () => {
  test('a person with no picture is drawn as their initials', () => {
    render(<PersonFace name="Sara Ali" initials="SA" image={null} />)

    expect(screen.getByText('SA')).toBeDefined()
    expect(screen.queryByRole('presentation', { hidden: true })).toBeNull()
  })

  test('a person with a picture is drawn as the picture', async () => {
    render(<PersonFace name="Sara Ali" initials="SA" image={picture} />)

    await waitFor(() => expect(screen.queryByRole('presentation', { hidden: true })).not.toBeNull())
    expect(face().getAttribute('src')).toBe(picture)
  })

  /*
  A privacy property rather than a detail, and nothing else in this repository
  asserts it.

  The src is one of two things and the second is cross-origin: 7.15's own
  `/api/v1/files/:id`, or the account picture stored from Google's `picture`
  claim, which lives on Google's user-content CDN. A face is drawn on nearly
  every screen in the product, so without this header every list, every roster
  and every conversation would tell Google which page of Dana the reader is
  standing on, once per person on it.

  It is one attribute, it is invisible when it is wrong, and no acceptance
  criterion looks at it. That is the whole case for pinning it here.
  */
  test('the picture is requested with no referrer, so Google is not told which page this is', async () => {
    render(<PersonFace name="Sara Ali" initials="SA" image={picture} />)

    await waitFor(() => expect(screen.queryByRole('presentation', { hidden: true })).not.toBeNull())
    expect(face().getAttribute('referrerpolicy')).toBe('no-referrer')
  })
})
