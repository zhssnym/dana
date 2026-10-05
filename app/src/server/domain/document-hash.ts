// The content-identity hash. Import nothing but node:crypto: this is a leaf module to break an import cycle
// that failed as "documentHash is not a function". Callers must pass canonical key order (sha256 of JSON.stringify).
import { createHash } from 'node:crypto'

export const documentHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

/**
 * Block rows as a revision hashes them. Columns added after a document's first revision are dropped when null,
 * so adding a column changes no stored revision.
 */
export const hashableBlocks = (
  rows: readonly Record<string, unknown>[],
  added: readonly string[] = ['toggleable'],
): Record<string, unknown>[] =>
  rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (added.includes(key) && (value === null || value === undefined)) continue
      out[key] = value
    }
    return out
  })
