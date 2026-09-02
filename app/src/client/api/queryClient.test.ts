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
})
