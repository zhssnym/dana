/*
The 7.16 shelf bodies, and specifically the sentence a 422 puts on the wire.

`src/server/http/errors.ts` builds every field problem as `${path}: ${message}`
(10.3), so a per-field message that names its own field doubles the prefix.
`postShelvesBody` did exactly that on both of its validated fields until #39,
and nothing noticed, because every test in the repository asserted the status
and the issue path and none asserted the sentence. `sentence` below is that
formatter restated in three lines rather than imported, on purpose: importing
`sendFieldValidationError` would drag Express into a schema test, and the
point is to read what a caller reads.
*/
import { describe, expect, test } from 'vitest'
import type { ZodError } from 'zod'

import { patchShelfBody, postShelvesBody } from './shelves.js'

/** `sendFieldValidationError`'s format, so these read as a caller reads. */
function sentence(error: ZodError): string {
  return `${error.issues
    .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
    .join('; ')}.`
}

function refusal(body: unknown): string {
  const result = postShelvesBody.safeParse(body)
  expect(result.success, `${JSON.stringify(body)} should be refused`).toBe(false)
  return result.success ? '' : sentence(result.error)
}

describe('postShelvesBody messages (10.3: the route prefixes the field)', () => {
  test('the colour message does not repeat the field name', () => {
    expect(refusal({ name: 'ok', color: 'red' })).toBe(
      'color: must be a hex color in #RRGGBB form.',
    )
  })

  test('the name message does not repeat the field name', () => {
    expect(refusal({ name: '' })).toBe('name: must be 1 to 40 characters.')
    expect(refusal({ name: 'x'.repeat(41) })).toBe(
      'name: must be 1 to 40 characters.',
    )
  })

  test('no message names its own field, whatever the body', () => {
    const bodies: readonly unknown[] = [
      { name: '' },
      { name: 'x'.repeat(41) },
      { name: 'ok', color: 'red' },
      { name: 'ok', color: '#12345' },
      { name: 'ok', color: '#GGHHII' },
      { name: 'ok', color: 7 },
      { name: '', color: 'red' },
    ]
    for (const body of bodies) {
      const result = postShelvesBody.safeParse(body)
      expect(result.success).toBe(false)
      if (result.success) continue
      for (const issue of result.error.issues) {
        const field = issue.path.map(String).join('.')
        expect(
          issue.message.startsWith(`${field}:`),
          `${field} names itself in "${issue.message}"`,
        ).toBe(false)
      }
    }
  })
})

describe('the shelf colour is folders.ts hexColor, one definition (#39)', () => {
  test('accepts what the shelves_color_format_check accepts', () => {
    for (const color of ['#000000', '#ffffff', '#AB12CD', '#aB12Cd']) {
      expect(postShelvesBody.safeParse({ name: 'ok', color }).success, color).toBe(
        true,
      )
      expect(patchShelfBody.safeParse({ color }).success, `patch ${color}`).toBe(
        true,
      )
    }
  })

  test('refuses what it refuses, in the same words on both bodies', () => {
    for (const color of ['red', '#12345', '#AB12CD1', '#GGHHII', 'AB12CD']) {
      const post = postShelvesBody.safeParse({ name: 'ok', color })
      const patch = patchShelfBody.safeParse({ color })
      expect(post.success, color).toBe(false)
      expect(patch.success, `patch ${color}`).toBe(false)
      if (!post.success && !patch.success) {
        expect(sentence(patch.error)).toBe(sentence(post.error))
      }
    }
  })

  test('null clears the colour and is not a format failure', () => {
    expect(postShelvesBody.safeParse({ name: 'ok', color: null }).success).toBe(
      true,
    )
    expect(patchShelfBody.safeParse({ color: null }).success).toBe(true)
  })
})
