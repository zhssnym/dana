/*
The 11.8 provider transport: Resend, one provider for all four templates.

**Why an HTTP call rather than the provider's SDK.** 11.8 names the provider
and nothing about how it is reached, and this is the whole of the integration:
one POST with five fields, the fifth arriving when 10.7 asked for a second
part. A dependency here would buy nothing and cost the
hazard 11.15 exists for, which is that training-data recall of an installed
library's current surface is wrong in specific ways a compiler cannot catch.
The HTTP endpoint is the provider's own documented contract and is what its
SDK sends. Protocol section 3 would have sanctioned the addition; this is a
choice not to need it.

**What never leaves this file.** The API key is read from the environment and
appears in no log line, no error message, and no return value. Neither does
the recipient address: 10.5 keeps addresses out of the logs, so a failed send
throws with the template name and the HTTP status only, never the provider's
response body, which echoes the address it refused. The caller logs the
throw.

**Sending is a production behavior and is gated as one.** 11.8 requires
logging instead of sending in development and tests, and the gate below is
positive rather than negative: a transport exists only when the process says
it is production and both variables are set. An unset NODE_ENV, a test runner,
a stray key in a local .env, none of them can reach a send. The cost of the
gate failing closed is a logged suppression; the cost of it failing open is a
real email to a real person from a developer's laptop.
*/
import { renderMessage } from './templates.js'
import type { NotificationTransport, NotifyLogger, OutboundMessage } from './index.js'

const ENDPOINT = 'https://api.resend.com/emails'

/** A provider call that hangs must not hold the reminder pass's transaction
 * open indefinitely; 11.7's next tick is 60 seconds away. */
const TIMEOUT_MS = 10_000

export interface ResendConfig {
  apiKey: string
  /** The 10.7 sender: noreply at the product domain, whose SPF, DKIM and
   * DMARC records are a launch prerequisite. */
  from: string
  /** This deployment's origin, for each template's one action link. */
  appOrigin: string
}

export function createResendTransport(
  config: ResendConfig,
): NotificationTransport {
  return {
    async send(message: OutboundMessage): Promise<void> {
      const rendered = renderMessage(message, { appOrigin: config.appOrigin })
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: config.from,
          to: [message.to],
          subject: rendered.subject,
          // Both parts (10.7): the provider assembles the multipart
          // alternative from the pair, and a send carrying html alone does
          // not meet the section. The text part is no stub; it is the same
          // composition rendered a second way.
          html: rendered.html,
          text: rendered.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) {
        // Status and template only. The body carries the address back.
        throw new Error(
          `the email provider refused a ${message.template} message with HTTP ${String(response.status)}`,
        )
      }
    },
  }
}

export interface TransportEnvironment {
  logger: NotifyLogger
  /** Defaulted rather than read at module load, so a caller can resolve
   * against an environment it composed. */
  env?: NodeJS.ProcessEnv
}

/**
 * The transport this process should send through, or undefined when it should
 * log instead (11.8).
 *
 * Called at construction, which is where 11.6 already reads DANA_DEV_LOGIN:
 * reading an environment variable is not I/O, so createApp stays inside
 * 11.10's discipline.
 */
export function resolveEmailTransport(
  options: TransportEnvironment,
): NotificationTransport | undefined {
  const env = options.env ?? process.env
  const apiKey = env.RESEND_API_KEY ?? ''
  const from = env.RESEND_FROM ?? ''
  const appOrigin = env.APP_ORIGIN ?? ''

  if (env.NODE_ENV !== 'production') {
    if (apiKey !== '') {
      options.logger.info(
        { configured: true },
        'email transport suppressed: sending is production only (spec 11.8)',
      )
    }
    return undefined
  }

  const missing = [
    ['RESEND_API_KEY', apiKey],
    ['RESEND_FROM', from],
    ['APP_ORIGIN', appOrigin],
  ]
    .filter((pair) => pair[1] === '')
    .map((pair) => pair[0])
  if (missing.length > 0) {
    // Loud rather than fatal: a process that cannot send email still serves
    // every request, and refusing to boot would trade a degraded deploy for
    // no deploy. Every suppressed send logs its own line after this one.
    options.logger.info(
      { missing: missing.join(', ') },
      'email transport unconfigured in production: messages will be logged, not sent (spec 11.8, 10.7)',
    )
    return undefined
  }

  return createResendTransport({ apiKey, from, appOrigin })
}
