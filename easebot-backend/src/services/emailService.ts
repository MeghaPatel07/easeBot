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

interface BuildInvoiceEmailArgs {
  recipientName: string | null
  invoiceNumber: string
  plan: string
  cycle: string
  amountLocal: number
  currency: string
  txnid: string
  paidAtIso: string
  legalEntityName: string
}

export function buildInvoiceEmail(args: BuildInvoiceEmailArgs): {
  subject: string
  html: string
  text: string
} {
  const greetingName =
    args.recipientName && args.recipientName.trim().length > 0
      ? args.recipientName.trim()
      : 'there'

  const planLabel =
    args.plan.toLowerCase() === 'promax' ? 'Pro Max'
    : args.plan.toLowerCase() === 'pro' ? 'Pro'
    : args.plan.charAt(0).toUpperCase() + args.plan.slice(1)

  const cycleLabel =
    args.cycle.toLowerCase() === 'annual' ? 'Annual'
    : args.cycle.toLowerCase() === 'monthly' ? 'Monthly'
    : args.cycle.charAt(0).toUpperCase() + args.cycle.slice(1)

  const amountFormatted = `${args.currency} ${args.amountLocal.toFixed(2)}`
  const paidOn = new Date(args.paidAtIso).toUTCString().replace(' GMT', ' UTC')

  const subject = `Payment receipt — Invoice ${args.invoiceNumber} — TheWeddingBot`

  const text = `Hi ${greetingName},

Thank you for subscribing to TheWeddingBot ${planLabel} (${cycleLabel}). Your payment has been received and your plan is now active.

Invoice number: ${args.invoiceNumber}
Plan:           TheWeddingBot ${planLabel} (${cycleLabel})
Amount paid:    ${amountFormatted}
Payment date:   ${paidOn}
Transaction ID: ${args.txnid}

A tax-compliant PDF copy of this invoice is available in Settings → Billing:
https://theweddingbot.ai/settings/billing

Refunds: Per our terms (§6.5), payments are non-refundable for partial cycles, unused tokens, or top-up packs.

Need help? Reply to this email or write to theweddingease@gmail.com.

Thank you for planning with us,
— TheWeddingBot team

${args.legalEntityName}
This is a transactional receipt for a confirmed payment. Please retain it for your records.
`

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#faf7f3; padding:24px; color:#2d2a26; margin:0;">
    <div style="max-width: 560px; margin: 0 auto; background:#ffffff; border-radius:12px; padding:32px; border:1px solid #efe7dc;">
      <h2 style="margin:0 0 8px 0; color:#8a5a2b;">Payment receipt</h2>
      <p style="margin:0 0 24px 0; color:#888; font-size:13px;">Invoice ${escapeHtml(args.invoiceNumber)}</p>

      <p style="margin:0 0 16px 0;">Hi ${escapeHtml(greetingName)},</p>
      <p style="margin:0 0 20px 0;">Thank you for subscribing to <strong>TheWeddingBot ${escapeHtml(planLabel)}</strong>. Your payment has been received and your plan is now active.</p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%; background:#fbf6ee; border:1px solid #efe2cb; border-radius:8px; padding:0; margin:16px 0;">
        <tbody>
          <tr><td style="padding:12px 16px; color:#666; font-size:13px; width:42%;">Invoice number</td><td style="padding:12px 16px; font-weight:600; text-align:right;">${escapeHtml(args.invoiceNumber)}</td></tr>
          <tr><td style="padding:12px 16px; color:#666; font-size:13px; border-top:1px solid #efe2cb;">Plan</td><td style="padding:12px 16px; font-weight:600; text-align:right; border-top:1px solid #efe2cb;">TheWeddingBot ${escapeHtml(planLabel)} (${escapeHtml(cycleLabel)})</td></tr>
          <tr><td style="padding:12px 16px; color:#666; font-size:13px; border-top:1px solid #efe2cb;">Amount paid</td><td style="padding:12px 16px; font-weight:600; text-align:right; border-top:1px solid #efe2cb;">${escapeHtml(amountFormatted)}</td></tr>
          <tr><td style="padding:12px 16px; color:#666; font-size:13px; border-top:1px solid #efe2cb;">Payment date</td><td style="padding:12px 16px; font-weight:600; text-align:right; border-top:1px solid #efe2cb;">${escapeHtml(paidOn)}</td></tr>
          <tr><td style="padding:12px 16px; color:#666; font-size:13px; border-top:1px solid #efe2cb;">Transaction ID</td><td style="padding:12px 16px; font-weight:600; text-align:right; font-family:Menlo, Consolas, monospace; font-size:13px; border-top:1px solid #efe2cb;">${escapeHtml(args.txnid)}</td></tr>
        </tbody>
      </table>

      <p style="margin:24px 0 8px 0;">A tax-compliant PDF copy of this invoice is available in your billing tab:</p>
      <p style="margin:0 0 24px 0;">
        <a href="https://theweddingbot.ai/settings/billing" style="display:inline-block; background:#c9a26a; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600;">View invoice</a>
      </p>

      <p style="margin:16px 0; color:#666; font-size:13px;"><strong>Refunds:</strong> Per our terms (§6.5), payments are non-refundable for partial cycles, unused tokens, or top-up packs.</p>

      <p style="margin:16px 0; color:#666; font-size:13px;">Need help? Reply to this email or write to <a href="mailto:theweddingease@gmail.com" style="color:#8a5a2b;">theweddingease@gmail.com</a>.</p>

      <p style="margin:24px 0 4px 0; color:#888; font-size:13px;">Thank you for planning with us,</p>
      <p style="margin:0 0 24px 0; color:#888; font-size:13px;">— TheWeddingBot team</p>

      <hr style="border:none; border-top:1px solid #efe7dc; margin:16px 0;" />
      <p style="margin:0; color:#aaa; font-size:11px;">${escapeHtml(args.legalEntityName)}</p>
      <p style="margin:4px 0 0 0; color:#aaa; font-size:11px;">This is a transactional receipt for a confirmed payment. Please retain it for your records.</p>
    </div>
  </body>
</html>`

  return { subject, html, text }
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const subject = 'Your Password Reset Code'
  const text = `Your password reset code is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request this, please ignore this email.`
  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#faf7f3; padding:24px; color:#2d2a26; margin:0;">
    <div style="max-width: 480px; margin: 0 auto; background:#ffffff; border-radius:12px; padding:32px; border:1px solid #efe7dc;">
      <div style="text-align:center; margin-bottom:24px;">
        <h2 style="color:#8a5a2b; font-size:20px; margin:0;">Password Reset</h2>
        <p style="color:#888; font-size:13px; margin:8px 0 0;">TheWeddingBot</p>
      </div>
      <div style="background:#fbf6ee; border-radius:12px; padding:24px; text-align:center; margin-bottom:24px; border:1px solid #efe2cb;">
        <p style="color:#666; font-size:14px; margin:0 0 12px;">Your verification code is</p>
        <div style="font-size:32px; font-weight:700; letter-spacing:8px; color:#c9a26a; font-family: Menlo, Consolas, monospace;">${otp}</div>
      </div>
      <p style="color:#999; font-size:12px; text-align:center; margin:0;">
        This code expires in 10 minutes.<br/>If you didn't request this, please ignore this email.
      </p>
    </div>
  </body>
</html>`
  await sendEmailNotification({ to, subject, text, html })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
