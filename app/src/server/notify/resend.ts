// The Resend transport over plain HTTP. Never log the API key or the recipient address;
// errors carry template and status only. Sends only in production with both variables set.
import { renderMessage } from './templates.js'
import type { NotificationTransport, NotifyLogger, OutboundMessage } from './index.js'

const ENDPOINT = 'https://api.resend.com/emails'

/** A hung provider call must not hold the reminder pass's transaction open. */
const TIMEOUT_MS = 10_000

export interface ResendConfig {
  apiKey: string
  /** The 10.7 sender address. */
  from: string
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
          // Both parts (10.7): a send with html alone does not meet the section.
          html: rendered.html,
          text: rendered.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) {
        // Status and template only. The body echoes the address.
        throw new Error(
          `the email provider refused a ${message.template} message with HTTP ${String(response.status)}`,
        )
      }
    },
  }
}

export interface TransportEnvironment {
  logger: NotifyLogger
  env?: NodeJS.ProcessEnv
}

/** The transport this process should send through, or undefined to log instead (11.8). */
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
    // Loud rather than fatal: the process still serves every request without email.
    options.logger.info(
      { missing: missing.join(', ') },
      'email transport unconfigured in production: messages will be logged, not sent (spec 11.8, 10.7)',
    )
    return undefined
  }

  return createResendTransport({ apiKey, from, appOrigin })
}
