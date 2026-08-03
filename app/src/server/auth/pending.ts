/*
The pending-authorization records of 11.6: state, nonce, the PKCE verifier,
and the tz reported on GET /auth/google. They live in process memory, keyed by
an opaque identifier the browser carries in an httpOnly cookie.

Why memory rather than a table: 11.6 fixes what a pending record holds and
never where it lives, the records are worthless the moment their authorization
completes, and a table would need a migration in app/db, which belongs to the
Data engineer. The cost is that authorizations begun before a restart cannot
complete, which costs the person one click on a sign-in that had not finished
anyway. This is the same single-instance assumption 11.1 already records for
rate limiting and the reminder tick, and it joins that list rather than adding
a new one.

Three properties the acceptance criteria turn on:

- **Bound to one browser.** The record is reachable only through the cookie
  the authorization request set, so a state minted for one browser is not
  spendable by another, which is the login CSRF of AC-105 rather than a
  decorative check that the server has seen this state before.
- **Single use.** take() removes the record, so a replayed callback finds
  nothing even when the provider would honor its code.
- **Bounded.** Records expire, and every take() sweeps, so an endpoint anyone
  can call cannot grow the map without limit.
*/
import { randomBytes } from 'node:crypto'

/** Long enough for a person to finish Google's consent screen, no longer. */
const PENDING_TTL_MS = 10 * 60 * 1000

export interface PendingAuthorization {
  state: string
  nonce: string
  codeVerifier: string
  /** The 7.1 tz, already validated; absent means none was reported. */
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

  /** Reads and removes: a record is spendable exactly once (11.6). */
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
