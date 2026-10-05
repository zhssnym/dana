/*
The object store (4.16): bytes only, keyed by the files row id; the row is the
authority. Disk store for development and tests, R2 in production. Construction
does no I/O. A missing object reads as null, never a throw.
*/
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createR2Store } from './r2-store.js'

export interface ObjectStore {
  put(id: string, bytes: Buffer): Promise<void>
  get(id: string): Promise<Buffer | null>
  remove(id: string): Promise<void>
}

export function createDiskStore(root: string): ObjectStore {
  let readied: Promise<void> | undefined
  const ready = (): Promise<void> => {
    readied ??= mkdir(root, { recursive: true }).then(() => undefined)
    return readied
  }
  // Ids are database uuids, never caller input; basename is belt and braces.
  const at = (id: string): string => path.join(root, path.basename(id))

  return {
    async put(id, bytes) {
      await ready()
      await writeFile(at(id), bytes)
    },
    async get(id) {
      try {
        return await readFile(at(id))
      } catch {
        return null
      }
    },
    async remove(id) {
      await rm(at(id), { force: true })
    },
  }
}

/** All four or none; `R2_ENDPOINT` is optional. */
const R2_VARIABLES = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const

/*
Chosen once at boot: R2 when configured, else DANA_FILES_DIR (in production a
persistent disk only; Render's filesystem is wiped on deploy), else the OS temp
dir. Production refuses to boot without durable storage, and any environment
refuses a partial R2 config, so a bad deploy fails instead of losing uploads.
*/
export function resolveObjectStore(env: NodeJS.ProcessEnv = process.env): ObjectStore {
  const set = (name: string): boolean => (env[name] ?? '') !== ''
  const present = R2_VARIABLES.filter(set)
  if (present.length > 0 && present.length < R2_VARIABLES.length) {
    const missing = R2_VARIABLES.filter((name) => !set(name))
    throw new Error(`file storage is half configured: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} unset`)
  }
  if (present.length === R2_VARIABLES.length) {
    return createR2Store({
      endpoint: set('R2_ENDPOINT') ? String(env.R2_ENDPOINT) : `https://${String(env.R2_ACCOUNT_ID)}.r2.cloudflarestorage.com`,
      bucket: String(env.R2_BUCKET),
      accessKeyId: String(env.R2_ACCESS_KEY_ID),
      secretAccessKey: String(env.R2_SECRET_ACCESS_KEY),
    })
  }
  if (set('DANA_FILES_DIR')) return createDiskStore(String(env.DANA_FILES_DIR))
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'file storage is not durable: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET, ' +
        "or DANA_FILES_DIR to a persistent disk; the service's own filesystem is wiped on every deploy",
    )
  }
  return createDiskStore(path.join(os.tmpdir(), 'dana-files'))
}
