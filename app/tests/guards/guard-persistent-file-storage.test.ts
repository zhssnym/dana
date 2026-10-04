import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDiskStore } from '../../src/server/files/store.js'

describe('file storage fallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows the temporary fallback in production instead of blocking boot', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => createDiskStore(path.join(os.tmpdir(), 'dana-files'))).not.toThrow()
  })

  it('keeps the same temporary fallback available outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')

    expect(() => createDiskStore(path.join(os.tmpdir(), 'dana-files'))).not.toThrow()
  })
})
