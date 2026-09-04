import { describe, expect, test } from 'vitest'

import { ERROR_TOAST } from '../state/toasts.js'
import { ApiError } from './http.js'
import {
  mutationFailureMessage,
  VALIDATION_ERROR_TOAST_META,
} from './queryClient.js'

describe('mutationFailureMessage', () => {
  const validationMeta = { [VALIDATION_ERROR_TOAST_META]: true }

  test('surfaces an opted-in 422 message', () => {
    expect(
      mutationFailureMessage(
        new ApiError(422, 'validation_failed', 'folders: expected array'),
        validationMeta,
      ),
    ).toBe('folders: expected array')
  })

  test('keeps other 422 responses and other failures on the global copy', () => {
    const error = new ApiError(422, 'validation_failed', 'field detail')
    expect(mutationFailureMessage(error, undefined)).toBe(ERROR_TOAST)
    expect(
      mutationFailureMessage(new ApiError(500, 'error', 'server detail'), validationMeta),
    ).toBe(ERROR_TOAST)
  })

  /* Issue #117: 10.3's storage ceiling is the third refusal whose sentence is
     already written for a person, so it needs no opt-in the way a 422 does.
     Both halves are asserted, because the clause is narrowed by the code as
     well as the status: a 413 that is not the quota has no sentence anybody
     wrote and falls back to section 9's. */
  test('surfaces the quota sentence of a 413, with no meta and no opt-in', () => {
    const quota = new ApiError(
      413,
      'quota_exceeded',
      "You've used your 1 GB of storage. Delete some files to add more.",
    )
    expect(mutationFailureMessage(quota, undefined)).toBe(
      "You've used your 1 GB of storage. Delete some files to add more.",
    )
    expect(
      mutationFailureMessage(new ApiError(413, 'error', 'too large'), undefined),
    ).toBe(ERROR_TOAST)
  })
})
