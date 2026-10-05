/*
The object store behind one interface (4.16). Bytes live here; the files
table is the authority on existence, ownership and quota, and its id is the
object key. Two factories return it: a disk store for development and tests,
and an R2 store for production (`r2-store.ts`); `resolveObjectStore` picks
one at boot, and nothing above the interface knows which.

Construction is pure: createApp performs no I/O (11.10), so the root
directory is made lazily at the first put rather than at boot. Reads answer
null for a missing object, never throw, because the row is the authority
and a row whose bytes are gone is an operational fact the route reports as
not-found rather than a crash.
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
  /* Development and tests. In production a disk store is only used when
     DANA_FILES_DIR names a persistent disk (`resolveObjectStore`). */
  let readied: Promise<void> | undefined
  const ready = (): Promise<void> => {
    readied ??= mkdir(root, { recursive: true }).then(() => undefined)
    return readied
  }
  // The id is a uuid minted by the database, never caller input, so it is
  // path-safe by construction; the join is belt and braces.
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

/** The R2 variables, all four or none. `R2_ENDPOINT` is optional and
 * defaults to the account's R2 origin. */
const R2_VARIABLES = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const

/*
The process's store, chosen once at boot from the environment (issue #550).

- R2, when its four variables are set. This is production's store: Render's
  own filesystem is wiped on every deploy, and R2 keeps the bytes without a
  paid persistent disk.
- A disk directory, when DANA_FILES_DIR is set. In production that must be a
  persistent disk mount; pointing it at an ordinary path to get past the check
  below loses every upload at the next deploy, which is the bug #550 fixes.
- Otherwise the OS temporary directory, which is development and tests.

Production refuses to start with neither R2 nor DANA_FILES_DIR, and any
environment refuses a partial R2 configuration. A refused boot cancels the
deploy and the running instance keeps serving (11.5), which is the right
failure: an instance that starts on throwaway storage accepts uploads and
then loses them.
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
