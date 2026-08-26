/*
The object store behind one interface (RFC 0005, 4.16; RFC 0004 S4). Bytes
live here; the files table is the authority on existence, ownership and
quota, and its id is the object key. A provider swap (the S3-compatible
question section 13 holds for S-inf) is a new factory returning this same
interface, and nothing above it changes, which is the S4 acceptance line.

Construction is pure: createApp performs no I/O (11.10), so the root
directory is made lazily at the first put rather than at boot. Reads answer
null for a missing object, never throw, because the row is the authority
and a row whose bytes are gone is an operational fact the route reports as
not-found rather than a crash.
*/
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

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
