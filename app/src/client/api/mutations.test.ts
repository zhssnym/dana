/*
What a mutation hook hands `useMutation`, which is the half of this file's two
conventions that nothing else can see.

`mutations.ts` opens by saying a hook here is "a request and a shape, and that
is all it should ever grow into": it invalidates nothing and reports nothing,
because `queryClient.ts` does both for every mutation at once. The one thing a
hook may say about reporting is **`meta`**, which asks for a 422 whose sentence
is already written for the person to act on, and a missing `meta` is invisible
— the write succeeds in every test, the failure path is the mutation cache's,
and what a person reads on a refusal appears nowhere in a type.

So `useMutation` is mocked to hand back the options it was given. That is not a
test of TanStack Query; it is the only seam at which "this hook opted in" is a
fact rather than a line of prose.
*/
import { describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useMutation: vi.fn((options: unknown) => options),
}))

vi.mock('@tanstack/react-query', () => ({ useMutation: mocks.useMutation }))

import { useDuplicateShelf } from './mutations.js'
import { VALIDATION_ERROR_TOAST_META } from './queryClient.js'

describe('useDuplicateShelf', () => {
  test('asks for its 422’s own sentence, which is the name it cannot fit', () => {
    useDuplicateShelf()

    const [options] = mocks.useMutation.mock.calls[0] as [
      { meta?: Record<string, unknown> },
    ]
    expect(
      options.meta?.[VALIDATION_ERROR_TOAST_META],
      'spec 7.16: a duplicate whose "(copy)" will not fit inside 10.3’s forty characters ' +
        'is refused 422 naming the name, and the person shortens it; the generic toast ' +
        'says nothing was saved and try again, and trying again earns the same refusal',
    ).toBe(true)
  })
})
