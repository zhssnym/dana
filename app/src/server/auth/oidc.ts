/*
Configuration and discovery for the Google OIDC client (11.6, openid-client 6).

Two rules from 11.10 shape this file. The construction seam is synchronous and
performs no I/O, so discovery cannot happen while the application is being
built; it happens on the first request that needs it and is memoized from
then on, on success only (see OidcClient below). And the issuer is injectable,
because a module that hardcodes accounts.google.com cannot be tested at all:
options win over the environment variables that remain the production path.

allowInsecureRequests is passed to discovery rather than applied afterwards,
because the metadata request itself is the first http call and would otherwise
be refused before any configuration exists to relax.

enableNonRepudiationChecks is not optional here, and the reason is a library
behavior worth knowing before touching this file. openid-client 6 does not
verify the ID token's signature in the authorization code flow by default:
OIDC Core section 3.1.3.7 item 6 permits a client to rely on TLS server
authentication of the direct token-endpoint channel instead, and the library
takes that permission. AC-106 does not: it requires a token signed with a key
that is not the provider's to be refused, and it is right to, because the
signature is the only check that survives a compromised or misconfigured
transport. Verified against the installed version: without this call a
rogue-key token established a session; with it the token is refused. Recorded
for the Steward as a library-versus-specification difference (protocol section
6, spec section 13).
*/
import {
  ClientSecretPost,
  allowInsecureRequests,
  discovery,
  enableNonRepudiationChecks,
} from 'openid-client'
import type { Configuration } from 'openid-client'

export interface AuthConfig {
  issuerUrl: string
  clientId: string
  clientSecret: string
  appOrigin: string
  allowInsecureRequests: boolean
}

const DEFAULT_ISSUER = 'https://accounts.google.com'

function required(name: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error(`${name} is not configured`)
  }
  return value
}

/**
 * The production path: five environment variables named in .env.example.
 * Reading them here rather than at module load keeps a test that sets them
 * around one createApp() call from leaking into the next.
 */
export function authConfigFromEnvironment(): AuthConfig {
  return {
    issuerUrl: process.env.GOOGLE_ISSUER_URL ?? DEFAULT_ISSUER,
    clientId: required('GOOGLE_CLIENT_ID', process.env.GOOGLE_CLIENT_ID),
    clientSecret: required(
      'GOOGLE_CLIENT_SECRET',
      process.env.GOOGLE_CLIENT_SECRET,
    ),
    appOrigin: required('APP_ORIGIN', process.env.APP_ORIGIN),
    allowInsecureRequests: process.env.OIDC_ALLOW_INSECURE === '1',
  }
}

/**
 * The redirect_uri, built from the configured origin and never from the
 * request's Host or forwarding headers (11.6, AC-109). It is a pure function
 * of configuration for exactly that reason.
 */
export function callbackUrl(config: AuthConfig): string {
  return `${config.appOrigin.replace(/\/$/, '')}/api/v1/auth/google/callback`
}

/**
 * Lazy discovery, memoized on success only: one metadata request per
 * configuration for as long as that request succeeded.
 *
 * The success-only part is the whole of it. Memoizing the promise itself
 * caches a rejection just as durably as a result, so a single transient
 * failure of the first metadata fetch (a DNS blip, a cold-start timeout
 * against the issuer) would disable sign-in for the life of the process and
 * be repaired only by a restart nobody knew to perform. The suite cannot see
 * that: its stub issuer always answers. Platform found it by reading, and it
 * is the kind of failure that arrives at 03:00 on the day Google's endpoint
 * is briefly slow.
 *
 * A failed attempt clears the field so the next request tries again, and
 * clears it only if it is still its own attempt, so a late rejection can
 * never discard a good configuration that replaced it. Callers that were
 * already awaiting the failed attempt still see the failure, because they
 * asked during it.
 */
export class OidcClient {
  private configuration: Promise<Configuration> | undefined

  constructor(readonly config: AuthConfig) {}

  async configure(): Promise<Configuration> {
    if (this.configuration === undefined) {
      const attempt: Promise<Configuration> = discovery(
        new URL(this.config.issuerUrl),
        this.config.clientId,
        { client_secret: this.config.clientSecret },
        ClientSecretPost(this.config.clientSecret),
        {
          execute: this.config.allowInsecureRequests
            ? [allowInsecureRequests, enableNonRepudiationChecks]
            : [enableNonRepudiationChecks],
        },
      ).catch((error: unknown) => {
        if (this.configuration === attempt) this.configuration = undefined
        throw error
      })
      this.configuration = attempt
    }
    return this.configuration
  }
}
