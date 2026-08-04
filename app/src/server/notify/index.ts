/*
The 11.8 notification module, transport half: send-or-log behind the 11.10
construction seam's options.notifications sink, ruled mid-P2 (d8e722f).

Why a sink exists at all: 11.8 forbids real sending in development and
tests, and 10.5 keeps recipient addresses out of the logs, so without
injection an outbound email is unobservable and AC-021 and AC-024 could
not count sends. When the seam injects a sink, every message is delivered
to its send(message); absent the sink, the module logs the suppression and
sends nothing. The log line carries only the template name, so the 10.5
rule is structural: the recipient address never reaches the logger in any
environment.

The Resend transport slots in here at P7 (11.8, 10.7); until then the
module logs in every sink-less environment, which the RFC 0001 P5 row
records ("the notification module logs until P7 lands the provider").
Call sites are the Collaboration engineer's (7.4 share grant now, 7.5
invites at P5): routes reach the per-application instance through
notifierOf(app), attached by createApp so the sink arrives with the same
construction call that carries the database handle.
*/
import type { Application } from 'express'

/** The three 11.8 templates. The harness matches share_grant by words, not
 * by exact spelling, but one canonical spelling means nothing depends on
 * that tolerance. */
export type MessageTemplate = 'invite' | 'share_grant' | 'reminder'

/*
One outbound email. 11.10 fixes that a message identifies its template and
its recipient and that the remaining keys are this module's own: the type
is closed, and template payload fields (action links, display names) are
added here when the templates gain content (P5 call sites, P7 rendering),
so every widening of what an email carries is a visible change to this
file rather than an ad-hoc key at a call site.
*/
export interface OutboundMessage {
  template: MessageTemplate
  /** Recipient address. Never logged (10.5); observable only through the
   * sink. */
  to: string
}

/** The 11.10 sink shape, { send(message) }, exactly what the acceptance
 * harness injects. */
export interface NotificationSink {
  send(message: OutboundMessage): void | Promise<void>
}

/** The slice of the boot logger this module needs, structural so unit
 * tests can capture emission without a pino instance. */
export interface NotifyLogger {
  info(fields: Record<string, unknown>, message: string): void
}

export interface Notifier {
  send(message: OutboundMessage): Promise<void>
}

export interface NotifierOptions {
  sink?: NotificationSink
  logger: NotifyLogger
}

/*
A sink failure propagates to the caller rather than being swallowed: under
test the sink is the observation channel and a throwing one should fail
loudly, and the failure policy for a real provider (retries, at-least-once
bookkeeping) belongs to the P7 transport, not to this seam.
*/
export function createNotifier(options: NotifierOptions): Notifier {
  const { sink, logger } = options
  return {
    async send(message: OutboundMessage): Promise<void> {
      if (sink !== undefined) {
        await sink.send(message)
        return
      }
      // Only the template crosses to the logger: 10.5 held structurally,
      // whatever keys OutboundMessage gains later.
      logger.info(
        { template: message.template },
        'outbound email suppressed: no transport configured',
      )
    },
  }
}

/*
Both directions of the app.locals convention live in this file so the key
cannot drift between writer and reader. createApp attaches; route modules
read. The key is deliberately not exported.
*/
const LOCALS_KEY = 'danaNotifier'

export function attachNotifier(app: Application, notifier: Notifier): void {
  ;(app.locals as Record<string, unknown>)[LOCALS_KEY] = notifier
}

export function notifierOf(app: Application): Notifier {
  const candidate = (app.locals as Record<string, unknown>)[LOCALS_KEY]
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    'send' in candidate &&
    typeof (candidate as Notifier).send === 'function'
  ) {
    return candidate as Notifier
  }
  throw new Error(
    'this application carries no notifier: createApp attaches one at construction (spec 11.10)',
  )
}
