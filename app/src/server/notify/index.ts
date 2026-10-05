// The 11.8 notifier. An injected sink (11.10) wins over the Resend transport, which wins over logging.
// The log line carries only the template name, so recipient addresses never reach the logger (10.5).
import type { Application } from 'express'

/** The 11.8 templates. Invites are two templates because the sink tells them apart by name. */
export type MessageTemplate =
  | 'invite_folder'
  | 'invite_connection'
  | 'share_grant'
  | 'reminder'

// One outbound email. A union, so a message cannot be built without the payload its template needs.
export type OutboundMessage =
  | {
      template: 'invite_folder'
      /** Recipient address. Never logged (10.5). */
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

// Null when 8.10 scrubbed the account before the send; the templates fall back to "Someone".
export interface InviterPayload {
  inviterName: string | null
}

/** The id is needed because a share grant links to that folder's page. */
export interface FolderPayload {
  folderId: string
  folderName: string
}

export interface FolderInvitePayload extends InviterPayload, FolderPayload {}

export type ConnectionInvitePayload = InviterPayload

export interface ShareGrantPayload extends InviterPayload, FolderPayload {}

/** Read in the claim statement, so the template renders from the row that fired. */
export interface ReminderPayload {
  taskId: string
  title: string
  /** Floating, as stored (4.4). Never rendered as "Today": the server cannot know whose today. */
  dueDate: string
  dueTime: string | null
  folderName: string
}

/** The 11.10 sink shape, as the acceptance harness injects it. */
export interface NotificationSink {
  send(message: OutboundMessage): void | Promise<void>
}

/** The 11.8 provider transport. Same shape as the sink; which one is present decides behaviour. */
export interface NotificationTransport {
  send(message: OutboundMessage): Promise<void>
}

export interface NotifyLogger {
  info(fields: Record<string, unknown>, message: string): void
}

export interface Notifier {
  send(message: OutboundMessage): Promise<void>
}

export interface NotifierOptions {
  sink?: NotificationSink
  /** Present only when this process sends (resolved by ./resend.ts). */
  transport?: NotificationTransport
  logger: NotifyLogger
}

// Sink and transport failures propagate: tests must fail loudly, and the 11.7 pass retries a refused send.
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
      // Only the template reaches the logger (10.5).
      logger.info(
        { template: message.template },
        'outbound email suppressed: no transport configured',
      )
    },
  }
}

// The app.locals key stays private to this file: createApp attaches, routes read.
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
