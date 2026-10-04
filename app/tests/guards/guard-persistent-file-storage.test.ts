import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDiskStore } from '../../src/server/files/store.js'

describe('persistent production file storage', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses the temporary directory in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => createDiskStore(path.join(os.tmpdir(), 'dana-files')))
      .toThrow('DANA_FILES_DIR must point to persistent storage in production')
  })

  it('keeps the temporary store available outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')

    expect(() => createDiskStore(path.join(os.tmpdir(), 'dana-files'))).not.toThrow()
  })
})
