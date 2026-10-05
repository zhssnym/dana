/*
Pending authorizations (11.6): state, nonce, PKCE verifier and the reported tz,
in process memory keyed by an httpOnly cookie. A restart drops in-flight
sign-ins; this assumes one instance (11.1). Bound to one browser (AC-105),
single use (take() removes), and bounded (records expire; every take() sweeps).
*/
import { randomBytes } from 'node:crypto'

/** Long enough to finish Google's consent screen. */
const PENDING_TTL_MS = 10 * 60 * 1000

export interface PendingAuthorization {
  state: string
  nonce: string
  codeVerifier: string
  /** Already validated; absent means none was reported. */
  timezone: string | undefined
  createdAt: number
}

export class PendingAuthorizations {
  private readonly records = new Map<string, PendingAuthorization>()

  constructor(private readonly ttlMs: number = PENDING_TTL_MS) {}

  create(record: Omit<PendingAuthorization, 'createdAt'>): string {
    this.sweep()
    const id = randomBytes(32).toString('base64url')
    this.records.set(id, { ...record, createdAt: Date.now() })
    return id
  }

  /** Reads and removes: spendable exactly once. */
  take(id: string | undefined): PendingAuthorization | undefined {
    this.sweep()
    if (id === undefined) return undefined
    const record = this.records.get(id)
    if (record === undefined) return undefined
    this.records.delete(id)
    return record
  }

  private sweep(): void {
    const deadline = Date.now() - this.ttlMs
    for (const [id, record] of this.records) {
      if (record.createdAt < deadline) this.records.delete(id)
    }
  }
}
