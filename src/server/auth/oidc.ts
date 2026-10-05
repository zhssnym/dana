/*
Google OIDC discovery (openid-client 6), lazy because createApp does no I/O.
Keep enableNonRepudiationChecks: openid-client does not verify the ID token
signature in the code flow by default, and AC-106 requires a foreign-key token
to be refused.
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

/** Read at call time, not module load, so env changes in one test do not leak into the next. */
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

/** Built from configuration, never from Host or forwarding headers (AC-109). */
export function callbackUrl(config: AuthConfig): string {
  return `${config.appOrigin.replace(/\/$/, '')}/api/v1/auth/google/callback`
}

/**
 * Lazy discovery memoized on success only: caching a rejected promise would
 * disable sign-in until restart after one transient failure. A failed attempt
 * clears the field only if it is still the current attempt.
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
