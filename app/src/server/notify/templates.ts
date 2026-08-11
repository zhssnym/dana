/*
The three 11.8 templates, rendered.

10.7 fixes the shape rather than the words: plain, short, one action link
each. Section 9 owns Dana's normative copy and carries none for email, so the
wording below is this module's, and it is deliberately spare. Nothing here is
observable to the acceptance suite, which counts sends through the 11.10 sink
and reads only a message's template and recipient; what a body says is
observable only to a person receiving one, which is why it is written where
one file holds all three rather than at the call sites.

The reminder template is the one with content, because P7 is the package that
produces a reminder and the pass hands it a payload. The invite and
share-grant templates render from a message that carries no payload at all,
their call sites (7.5, 7.4) having none to give yet, so they say the one true
thing an empty message supports and point at the application. When those call
sites gain a payload, OutboundMessage gains the fields and these two gain the
sentences; that widening is visible here and in the message type rather than
spread across routes.

Never rendered into a body: anything 10.5 keeps out of the logs is a
different question from what an email may carry, and the two must not be
confused. A reminder email carries its task's title because a reminder
without one is unusable; the log line for the same send carries only the
template, which is the notifier's own structural guarantee.
*/
import type { OutboundMessage } from './index.js'

export interface RenderedEmail {
  subject: string
  text: string
}

export interface TemplateContext {
  /** This deployment's own origin, scheme included and no trailing slash: the
   * one action link 10.7 asks each template for. */
  appOrigin: string
}

/** 10.6 fixes /app as the installed application's start URL, so it is where
 * every action link lands; the client routes onward from there. */
function actionLink(context: TemplateContext): string {
  return `${context.appOrigin}/app`
}

/** The floating due date and optional wall time as the person wrote them
 * (4.4). No zone is named because none applies: a floating time reads as the
 * reader's own local time by design (8.1, section 13 item 10). */
function dueLine(dueDate: string, dueTime: string | null): string {
  return dueTime === null ? `Due ${dueDate}` : `Due ${dueDate} at ${dueTime}`
}

export function renderMessage(
  message: OutboundMessage,
  context: TemplateContext,
): RenderedEmail {
  const link = actionLink(context)
  switch (message.template) {
    case 'reminder': {
      const task = message.reminder
      if (task === undefined) {
        // The pass always carries the payload; a reminder without one is a
        // caller defect rather than a message to invent a body for, and
        // sending a blank reminder would be worse than refusing to send.
        throw new TypeError(
          'a reminder message carries no task payload, so there is nothing to remind anyone of',
        )
      }
      return {
        subject: `Reminder: ${task.title}`,
        text: [
          task.title,
          dueLine(task.dueDate, task.dueTime),
          '',
          `Open Dana: ${link}`,
        ].join('\n'),
      }
    }
    case 'invite':
      return {
        subject: 'You have been invited to Dana',
        text: [
          'Someone has invited you to share a list on Dana.',
          '',
          `Sign in to accept: ${link}`,
        ].join('\n'),
      }
    case 'share_grant':
      return {
        subject: 'A folder has been shared with you on Dana',
        text: [
          'Someone has shared a folder with you on Dana. It is waiting in your sidebar.',
          '',
          `Open Dana: ${link}`,
        ].join('\n'),
      }
  }
}
