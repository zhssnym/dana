/*
The four 11.8 templates, rendered as HTML with a text/plain alternative.

**The words are designed copy, not this module's to restyle.** Every subject,
heading, body, context line, action label and destination below is the
designer's, and this file is where that copy lives.

**Two parts, because 10.7 says two:** HTML with a **required** text/plain
alternative. The text part must say the same thing and carry the same one
action link rather than being a stub. "Short" and "one action link each" are
the halves that do the deliverability work. So every message below is written once, as a
Composition, and rendered twice; nothing is said in one part that the other
does not say, because neither part is authored separately.

**11.4 and the values written out a second time.** `app/src/client/styles/tokens.css` is the single tokens file and that
rule does not move; it governs the client, and an email client reads no
external stylesheet, so a rendered message must carry every value inline.
The colours below are that file's graphite ramp transcribed, each named after
the token it came from so a divergence is findable, and the font stack is the
token file's fallback run because the self-hosted Inter arrives with a client
bundle no email loads. `auth/pages.ts` carries the same duplication with the
same reason in its own header.

**Two glyphs of the treatment are not carried, and that is a medium
constraint rather than a judgement about the design.** The design draws a
lucide icon in the purpose tile and a second in the context card. Both are
inline SVG, which Gmail strips and which the Word rendering engine behind
Outlook on Windows does not draw, so on most clients the tiles would arrive as
empty bordered boxes. The purpose badge says the same fact in words
everywhere, so the badge is kept and the tiles are dropped. The mark is an img
at the deployment's own origin with alt text, so a client with remote images
blocked reads the wordmark rather than nothing.

**Everything a person wrote is escaped into the HTML part.** A folder name, a
display name and a task title are all somebody's own words, and the day one of
them carries markup must not be the day an email client draws it.

Never rendered into a body: anything 10.5 keeps out of the logs is a
different question from what an email may carry, and the two must not be
confused. A reminder email carries its task's title because a reminder
without one is unusable; the log line for the same send carries only the
template, which is the notifier's own structural guarantee.
*/
import type { OutboundMessage } from './index.js'

export interface RenderedEmail {
  subject: string
  /** The HTML part, a whole document: an email client is handed a document
   * rather than a fragment. */
  html: string
  /** 10.7's required alternative, saying the same thing and carrying the
   * same one link. */
  text: string
}

export interface TemplateContext {
  /** This deployment's own origin, scheme included and no trailing slash:
   * every action link and the mark are built from it. */
  appOrigin: string
}

/* ------------------------------------------------------------------ *
 * The four compositions
 * ------------------------------------------------------------------ */

/**
 * One message, said once. Both parts render from this and neither adds a
 * sentence of its own, which is how 10.7's "the same thing" is held by
 * construction rather than by two authors agreeing.
 */
interface Composition {
  subject: string
  /** The badge, top right: what kind of message this is, in words. */
  purpose: string
  heading: string
  body: string
  /** The context card: the thing this message is about, and one line saying
   * how it relates to the reader. */
  contextTitle: string
  contextMeta: string
  action: string
  href: string
  footer: string
}

/** The line every message closes with that is not an invitation. */
const SENT_BY_DANA = 'Sent by Dana'

/*
The orientation footer, on the two invitations and on neither of the others.
The discriminator is whether the recipient knows what Dana is: an
invitation goes to a bare address that may hold no account, so the line is
orientation the reader needs before deciding to click, and its second clause
is the single most useful thing to tell them, Google being the only sign-in
method. A share grant reaches an existing connection and a reminder reaches
the person who set it, where the same line is filler that makes a functional
message look promotional.

That boundary is a deliverability rule rather than a matter of taste: the
transactional exemptions in CAN-SPAM and PECR, and a mailbox provider's own
promotional classification, turn on whether a message is functional, and
promotional content can pull in an unsubscribe requirement, which would be a
second link where 10.7 allows one.

The em dash is the designed copy, quoted rather than restyled.
*/
const ORIENTATION_FOOTER =
  "Dana keeps a project's tasks, notes and people on one page. You'll sign in with Google — there's no password to create."

/** 10.6 fixes /app as the installed application's start URL, and 9.8's
 * invite gate deliberately has no path of its own: it renders in place of the
 * application whenever there are pending invites, over whatever /app route is
 * beneath it. So "the invites view" is this address, while the other two
 * templates address rows of 9.1's table. */
function startUrl(context: TemplateContext): string {
  return `${context.appOrigin}/app`
}

/** "Someone" as the fallback rather than as the sentence: 8.10 can scrub an
 * account between the act and the send, and the copy keeps the word for that
 * case alone. It is resolved here so no call site can choose another. */
function inviterOf(name: string | null): string {
  return name === null || name.trim() === '' ? 'Someone' : name
}

/** The floating due date and its wall time as the person wrote them (4.4).
 * No zone is named because none applies, and no relative wording is used
 * because a floating time reads as the reader's own local time (8.1) and a
 * server composing "Today" would have to decide whose today that is. */
function dueLine(dueDate: string, dueTime: string | null): string {
  return dueTime === null ? dueDate : `${dueDate} at ${dueTime}`
}

function compose(
  message: OutboundMessage,
  context: TemplateContext,
): Composition {
  switch (message.template) {
    case 'invite_folder': {
      const { inviterName, folderName } = message.folderInvite
      const inviter = inviterOf(inviterName)
      return {
        subject: `${inviter} invited you to ${folderName} on Dana`,
        purpose: 'Folder invitation',
        heading: `You're invited to ${folderName}`,
        body: `${inviter} invited you to join this folder in Dana. Accepting adds it to your sidebar, with everything already in it.`,
        contextTitle: folderName,
        contextMeta: `Shared folder · From ${inviter}`,
        action: 'Review invitation',
        href: startUrl(context),
        footer: ORIENTATION_FOOTER,
      }
    }
    case 'invite_connection': {
      const inviter = inviterOf(message.connectionInvite.inviterName)
      return {
        subject: `${inviter} wants to connect on Dana`,
        purpose: 'Connection invitation',
        heading: `Connect with ${inviter}`,
        body: `${inviter} invited you to connect on Dana. Once you're connected, either of you can share a folder in a single step.`,
        contextTitle: inviter,
        contextMeta: 'Connection invitation',
        action: 'Review invitation',
        href: startUrl(context),
        footer: ORIENTATION_FOOTER,
      }
    }
    case 'share_grant': {
      const { inviterName, folderId, folderName } = message.shareGrant
      const inviter = inviterOf(inviterName)
      return {
        subject: `${inviter} shared ${folderName} with you on Dana`,
        purpose: 'Folder shared',
        heading: `${folderName} was shared with you`,
        body: `${inviter} shared this folder with you. It's in your sidebar now, ready to open.`,
        contextTitle: folderName,
        contextMeta: `Shared folder · Shared by ${inviter}`,
        // The one action label carrying data, named beside its destination
        // rather than left as a generic "Open Dana".
        action: `Open ${folderName}`,
        href: `${context.appOrigin}/app/folders/${folderId}`,
        footer: SENT_BY_DANA,
      }
    }
    case 'reminder': {
      const task = message.reminder
      return {
        subject: `Reminder: ${task.title}`,
        purpose: 'Task reminder',
        heading: task.title,
        // The body names neither the folder nor the due, both of which the
        // context card carries; saying either would repeat the card's line.
        body: 'You set a reminder for this task.',
        contextTitle: dueLine(task.dueDate, task.dueTime),
        contextMeta: `In ${task.folderName}`,
        action: 'Open task',
        href: `${context.appOrigin}/app/tasks/${task.taskId}`,
        footer: SENT_BY_DANA,
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * The two renderings
 * ------------------------------------------------------------------ */

/*
tokens.css's graphite ramp, transcribed. Each name is the token it came from,
so the two files can be compared without guessing which value is which.
*/
const GRAPHITE_25 = '#fafafb'
const GRAPHITE_50 = '#f4f5f6'
const GRAPHITE_200 = '#dddee2'
const GRAPHITE_500 = '#6e7076'
const GRAPHITE_600 = '#585a60'
const GRAPHITE_900 = '#1b1c20'
const GRAPHITE_950 = '#0a0a0a'
const WHITE = '#ffffff'
/** The token file's fallback run. Inter itself is self-hosted and arrives
 * with a client bundle, which no email loads. */
const SANS =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
/** --radius-md, which is --radius. */
const RADIUS = '6px'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/*
The HTML part: tables, inline styles, and nothing an email client has to
fetch but the mark.

Tables rather than flexbox because the Word rendering engine behind Outlook
on Windows lays out tables and does not lay out flex, so a flexbox
composition arrives there as a stack of full-width blocks.

The document carries an empty title deliberately. A title is drawn in no mail
client's message body, and filling it with the subject would put a sentence in
the HTML part that the text part does not carry, which is what 10.7's amended
rule forbids.
*/
function renderHtml(composition: Composition, context: TemplateContext): string {
  const cell = `font-family:${SANS};-webkit-font-smoothing:antialiased;`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title></title>
</head>
<body style="margin:0;padding:0;background:${GRAPHITE_50};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GRAPHITE_50};">
<tr><td align="center" style="padding:56px 24px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${WHITE};border:1px solid ${GRAPHITE_200};border-radius:14px;">
  <tr><td style="height:4px;line-height:4px;font-size:0;background:${GRAPHITE_950};border-radius:14px 14px 0 0;">&nbsp;</td></tr>
  <tr><td style="padding:22px 40px;border-bottom:1px solid ${GRAPHITE_200};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td valign="middle" style="${cell}font-size:14px;font-weight:600;color:${GRAPHITE_900};">
          <img src="${context.appOrigin}/icon-192.png" width="24" height="24" alt="Dana" style="vertical-align:middle;border:0;border-radius:6px;">
          <span style="vertical-align:middle;padding-left:10px;">Dana</span>
        </td>
        <td align="right" valign="middle" style="${cell}font-size:10px;letter-spacing:0.04em;color:${GRAPHITE_600};">
          <span style="display:inline-block;padding:5px 10px;border:1px solid ${GRAPHITE_200};border-radius:${RADIUS};background:${GRAPHITE_50};">${escapeHtml(composition.purpose)}</span>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:40px;">
    <h1 style="${cell}margin:0;font-size:28px;line-height:36px;font-weight:600;letter-spacing:-0.035em;color:${GRAPHITE_950};">${escapeHtml(composition.heading)}</h1>
    <p style="${cell}margin:12px 0 0;font-size:14px;line-height:24px;color:${GRAPHITE_600};">${escapeHtml(composition.body)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border:1px solid ${GRAPHITE_200};border-radius:10px;background:${GRAPHITE_25};">
      <tr><td style="padding:16px;">
        <p style="${cell}margin:0;font-size:14px;font-weight:500;color:${GRAPHITE_900};">${escapeHtml(composition.contextTitle)}</p>
        <p style="${cell}margin:4px 0 0;font-size:12px;color:${GRAPHITE_500};">${escapeHtml(composition.contextMeta)}</p>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;">
      <tr><td style="border-radius:${RADIUS};background:${GRAPHITE_950};">
        <a href="${escapeHtml(composition.href)}" style="${cell}display:inline-block;padding:11px 16px;font-size:14px;font-weight:500;line-height:18px;color:${WHITE};text-decoration:none;">${escapeHtml(composition.action)}</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="${cell}padding:18px 40px;border-top:1px solid ${GRAPHITE_200};background:${GRAPHITE_25};font-size:12px;line-height:20px;color:${GRAPHITE_500};border-radius:0 0 14px 14px;">${escapeHtml(composition.footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`
}

/** The same message as text, in the same order, with the one link written out
 * where the button is. */
function renderText(composition: Composition): string {
  return [
    'Dana',
    composition.purpose,
    '',
    composition.heading,
    '',
    composition.body,
    '',
    composition.contextTitle,
    composition.contextMeta,
    '',
    `${composition.action}: ${composition.href}`,
    '',
    composition.footer,
  ].join('\n')
}

export function renderMessage(
  message: OutboundMessage,
  context: TemplateContext,
): RenderedEmail {
  const composition = compose(message, context)
  return {
    subject: composition.subject,
    html: renderHtml(composition, context),
    text: renderText(composition),
  }
}
