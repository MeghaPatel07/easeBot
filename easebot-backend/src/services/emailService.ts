/**
 * Email helper for reminder notifications.
 *
 * Delivers via Nodemailer over SMTP. Env vars:
 *   SMTP_USER              (required) — SMTP auth username / from address
 *   SMTP_PASS              (required) — SMTP auth password / app password
 *   SMTP_HOST              (optional) — defaults to smtp.gmail.com
 *   SMTP_PORT              (optional) — defaults to 465
 *   SMTP_SECURE            (optional) — 'true' | 'false', defaults to true (465)
 *   REMINDER_FROM_EMAIL    (optional) — defaults to "TheWeddingBot <SMTP_USER>"
 *
 * Dry-run mode: if SMTP_USER or SMTP_PASS is unset, log and return without
 * throwing. Keeps local dev and QA flows green without accidental real sends.
 */

import nodemailer, { type Transporter } from 'nodemailer'

interface SendEmailArgs {
  to: string
  subject: string
  html: string
  text: string
}

let cachedTransporter: Transporter | null = null

function getTransporter(): Transporter | null {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return null
  if (cachedTransporter) return cachedTransporter

  const host = process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = Number(process.env.SMTP_PORT || 465)
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : port === 465

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })
  return cachedTransporter
}

export async function sendEmailNotification(args: SendEmailArgs): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn(
      '[emailService] SMTP_USER/SMTP_PASS not set, skipping send (dry-run mode)',
    )
    return
  }
  const from =
    process.env.REMINDER_FROM_EMAIL ||
    `TheWeddingBot <${process.env.SMTP_USER}>`

  await transporter.sendMail({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  })
}

interface BuildReminderEmailArgs {
  name: string | null
  title: string
  description: string | null
  humanFormattedDate: string
  channelLabel: string
}

export function buildReminderEmail(args: BuildReminderEmailArgs): {
  subject: string
  html: string
  text: string
} {
  const greetingName = args.name && args.name.trim().length > 0 ? args.name : 'there'
  const subject = `\u23F0 Reminder: ${args.title}`

  const descriptionLine = args.description
    ? `\n${args.description}\n`
    : ''
  const descriptionHtml = args.description
    ? `<p style="margin:0 0 12px 0;color:#555;">${escapeHtml(args.description)}</p>`
    : ''

  const text = `Hi ${greetingName},

This is a reminder from TheWeddingBot.

📌 ${args.title}
📅 ${args.humanFormattedDate}
${descriptionLine}
Open your planner: https://theweddingbot.ai/chat

Need to reschedule? Just ask TheWeddingBot.

— TheWeddingBot team
`

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#faf7f3; padding:24px; color:#2d2a26;">
    <div style="max-width: 560px; margin: 0 auto; background:#ffffff; border-radius:12px; padding:32px; border:1px solid #efe7dc;">
      <h2 style="margin:0 0 16px 0; color:#8a5a2b;">⏰ Reminder from TheWeddingBot</h2>
      <p style="margin:0 0 16px 0;">Hi ${escapeHtml(greetingName)},</p>
      <p style="margin:0 0 16px 0;">This is a friendly nudge from your wedding planner.</p>
      <div style="background:#fbf6ee; border-left:4px solid #c9a26a; padding:16px; border-radius:6px; margin:16px 0;">
        <p style="margin:0 0 8px 0; font-size:18px; font-weight:600;">📌 ${escapeHtml(args.title)}</p>
        <p style="margin:0 0 8px 0; color:#666;">📅 ${escapeHtml(args.humanFormattedDate)}</p>
        ${descriptionHtml}
      </div>
      <p style="margin:16px 0;">
        <a href="https://theweddingbot.ai/chat" style="display:inline-block; background:#c9a26a; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600;">Open your planner</a>
      </p>
      <p style="margin:16px 0 0 0; color:#888; font-size:13px;">Need to reschedule? Just ask TheWeddingBot.</p>
      <p style="margin:24px 0 0 0; color:#888; font-size:13px;">— TheWeddingBot team</p>
    </div>
  </body>
</html>`

  // channelLabel currently unused in the rendered body but kept on the API for
  // downstream callers that may want to surface it (e.g. test harnesses).
  void args.channelLabel

  return { subject, html, text }
}

interface BuildNoteInviteEmailArgs {
  inviterName: string
  inviterEmail: string
  recipientName: string
  noteTitle: string
  permission: string
  shareId: string | null
}

export function buildNoteInviteEmail(args: BuildNoteInviteEmailArgs): {
  subject: string
  html: string
  text: string
} {
  const permissionLabel =
    args.permission === 'editor' ? 'edit'
    : args.permission === 'commenter' ? 'comment on'
    : 'view'

  const subject = `${args.inviterName} shared a note with you on TheWeddingBot`
  const appUrl = 'https://theweddingbot.ai/chat'
  const noteUrl = args.shareId
    ? `https://theweddingbot.ai/shared/note/${args.shareId}`
    : appUrl

  const text = `Hi ${args.recipientName},

${args.inviterName} (${args.inviterEmail}) invited you to ${permissionLabel} a note on TheWeddingBot:

"${args.noteTitle}"

Open it here: ${noteUrl}

— TheWeddingBot team
`

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#faf7f3; padding:24px; color:#2d2a26;">
    <div style="max-width: 560px; margin: 0 auto; background:#ffffff; border-radius:12px; padding:32px; border:1px solid #efe7dc;">
      <h2 style="margin:0 0 16px 0; color:#8a5a2b;">📝 You've been invited to a note</h2>
      <p style="margin:0 0 16px 0;">Hi ${escapeHtml(args.recipientName)},</p>
      <p style="margin:0 0 16px 0;"><strong>${escapeHtml(args.inviterName)}</strong> (${escapeHtml(args.inviterEmail)}) invited you to <strong>${escapeHtml(permissionLabel)}</strong> a note on TheWeddingBot.</p>
      <div style="background:#fbf6ee; border-left:4px solid #c9a26a; padding:16px; border-radius:6px; margin:16px 0;">
        <p style="margin:0; font-size:18px; font-weight:600;">📌 ${escapeHtml(args.noteTitle)}</p>
      </div>
      <p style="margin:16px 0;">
        <a href="${noteUrl}" style="display:inline-block; background:#c9a26a; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600;">Open note</a>
      </p>
      <p style="margin:24px 0 0 0; color:#888; font-size:13px;">— TheWeddingBot team</p>
    </div>
  </body>
</html>`

  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
