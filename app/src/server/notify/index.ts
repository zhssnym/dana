/*
The 11.8 notification module, transport half: send-or-log behind the 11.10
construction seam's options.notifications sink.

Why a sink exists at all: 11.8 forbids real sending in development and
tests, and 10.5 keeps recipient addresses out of the logs, so without
injection an outbound email is unobservable and no test could count
sends. When the seam injects a sink, every message is delivered
to its send(message); absent the sink, the module logs the suppression and
sends nothing. The log line carries only the template name, so the 10.5
rule is structural: the recipient address never reaches the logger in any
environment.

The Resend transport is ./resend.ts, and the four templates, each in two
parts, are ./templates.ts. The order of precedence here is 11.10's
sentence read literally: an injected sink replaces the logging, and absent
one, 11.8 stands unchanged, which is log in development and tests and send
in production. So the sink wins over the transport, the transport over the
log, and a process with neither still sends nothing and says so.

Call sites are the routes (7.4 share grant, 7.5 invites) and the scheduler
pass's reminder: routes reach the
per-application instance through notifierOf(app), attached by createApp so
the sink arrives with the same construction call that carries the database
handle, and the pass is handed that same instance at boot.
*/
import type { Application } from 'express'

/** The four 11.8 templates. The harness matches share_grant by words rather
 * than by exact spelling, but one canonical spelling means nothing depends
 * on that tolerance.
 *
 * The invite is two templates because 7.5 makes folder_id optional, so
 * one name would carry two events whose subject, heading and context all differ;
 * and the template name is what the 11.10 sink reads, so under one name no
 * acceptance criterion could tell a folder invitation from a connection
 * invitation. Both names still answer the invite matcher the sharing
 * harness matches by word. */
export type MessageTemplate =
  | 'invite_folder'
  | 'invite_connection'
  | 'share_grant'
  | 'reminder'

/*
One outbound email. 11.10 fixes that a message identifies its template and
its recipient and that the remaining keys are this module's own: the type is
closed, and template payload fields are added here rather than at a call
site, so every widening of what an email carries is a visible change to this
file.

**It is a union rather than one interface with optional payloads.** With an
optional key, a call site passing nothing still typechecks and the template
has no choice but to write a sentence about nobody ("Someone has invited
you"). Under the union a message cannot be constructed without the payload its
own template renders from, so the compiler holds that property. The two keys
11.10 fixes, template and to, are on every arm.
*/
export type OutboundMessage =
  | {
      template: 'invite_folder'
      /** Recipient address. Never logged (10.5); observable only through the
       * sink. */
      to: string
      folderInvite: FolderInvitePayload
    }
  | {
      template: 'invite_connection'
      to: string
      connectionInvite: ConnectionInvitePayload
    }
  | { template: 'share_grant'; to: string; shareGrant: ShareGrantPayload }
  | { template: 'reminder'; to: string; reminder: ReminderPayload }

/*
The inviter as a template renders them.

Nullable because 8.10 can scrub an account between the act and the send, and
the copy keeps "Someone" as the fallback for exactly that edge case.
Resolving the fallback belongs to the templates rather than to a call site,
so no two call sites can choose different words for the same silence.
*/
export interface InviterPayload {
  inviterName: string | null
}

/** A folder as a template renders and links to it. The id rides along
 * because the action destinations are per template: a share grant
 * opens that folder's own page, which a payload carrying only a name could
 * not address. */
export interface FolderPayload {
  folderId: string
  folderName: string
}

export interface FolderInvitePayload extends InviterPayload, FolderPayload {}

export type ConnectionInvitePayload = InviterPayload

export interface ShareGrantPayload extends InviterPayload, FolderPayload {}

/** The 11.7 pass reads these columns in the same statement that claims the
 * row, so the template renders from the row that fired rather than from a
 * second read that could disagree with it. */
export interface ReminderPayload {
  taskId: string
  title: string
  /** Floating, as stored (4.4): the date the task is due, and its wall time
   * when it has one. Never rendered as "Today": a floating time reads as the
   * reader's own local time (8.1), and a server composing "Today" would have
   * to decide whose today that is. */
  dueDate: string
  dueTime: string | null
  /** The folder the task lives in, which is this template's context line.
   * The claim statement already joins folders, so it costs no read. */
  folderName: string
}

/** The 11.10 sink shape, { send(message) }, exactly what the acceptance
 * harness injects. */
export interface NotificationSink {
  send(message: OutboundMessage): void | Promise<void>
}

/**
 * The 11.8 provider transport, structurally the sink's twin and semantically
 * its opposite: the sink exists so a test can observe a message that must not
 * be sent, and the transport exists to send one. Two names because one of
 * them being present decides what the other does.
 */
export interface NotificationTransport {
  send(message: OutboundMessage): Promise<void>
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
  /** The 11.8 provider, when this process is one that sends. Resolved by
   * ./resend.ts from the environment; absent everywhere else. */
  transport?: NotificationTransport
  logger: NotifyLogger
}

/*
A sink failure propagates to the caller rather than being swallowed: under
test the sink is the observation channel and a throwing one should fail
loudly. A transport failure propagates for the same reason turned around:
the one caller that can do something about a refused send is the 11.7 pass,
which leaves the reminder row scheduled so the next tick retries it, and it
can only do that if it hears. Retry policy is that caller's, not this seam's.
*/
export function createNotifier(options: NotifierOptions): Notifier {
  const { sink, transport, logger } = options
  return {
    async send(message: OutboundMessage): Promise<void> {
      if (sink !== undefined) {
        await sink.send(message)
        return
      }
      if (transport !== undefined) {
        await transport.send(message)
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
