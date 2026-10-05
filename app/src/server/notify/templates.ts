// The 11.8 email templates: designed copy, rendered as HTML plus an equivalent text part (10.7).
// Email clients read no stylesheet, so token values are inlined from tokens.css. Escape everything a person wrote.
import type { OutboundMessage } from './index.js'

export interface RenderedEmail {
  subject: string
  html: string
  /** 10.7's required alternative: the same words and the same one link. */
  text: string
}

export interface TemplateContext {
  /** Origin with scheme and no trailing slash. */
  appOrigin: string
}

/** One message. Both parts render from it and neither adds a sentence. */
interface Composition {
  subject: string
  purpose: string
  heading: string
  body: string
  contextTitle: string
  contextMeta: string
  action: string
  href: string
  footer: string
}

const SENT_BY_DANA = 'Sent by Dana'

// The orientation footer goes on invitations only: their recipients may not know Dana.
// On other messages it reads as promotional, which can hurt the transactional classification.
const ORIENTATION_FOOTER =
  "Dana keeps a project's tasks, notes and people on one page. You'll sign in with Google — there's no password to create."

/** /app is the invites view: the invite gate renders over whatever /app route is open. */
function startUrl(context: TemplateContext): string {
  return `${context.appOrigin}/app`
}

function inviterOf(name: string | null): string {
  return name === null || name.trim() === '' ? 'Someone' : name
}

/** The floating due date and time as written (4.4). No zone and no "Today": whose today would it be? */
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

// tokens.css's graphite ramp, transcribed. Each name is the token it came from.
const GRAPHITE_25 = '#fafafb'
const GRAPHITE_50 = '#f4f5f6'
const GRAPHITE_200 = '#dddee2'
const GRAPHITE_500 = '#6e7076'
const GRAPHITE_600 = '#585a60'
const GRAPHITE_900 = '#1b1c20'
const GRAPHITE_950 = '#0a0a0a'
const WHITE = '#ffffff'
/** The fallback font stack from tokens.css; emails cannot load the self-hosted Inter. */
const SANS =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
/** --radius-md. */
const RADIUS = '6px'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Tables, not flexbox: Outlook on Windows does not lay out flex.
// The title stays empty so the HTML part says nothing the text part does not.
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
