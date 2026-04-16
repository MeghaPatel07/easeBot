import nodemailer from 'nodemailer'

// SMTP config from environment variables.
// Supports any provider: Gmail, SendGrid, Mailgun, SES, etc.
// Required env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Optional: SMTP_FROM (defaults to SMTP_USER)
function getTransporter() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS env vars.')
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const transporter = getTransporter()
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER

  await transporter.sendMail({
    from: `"Wedding Ease" <${from}>`,
    to,
    subject: 'Your Password Reset Code',
    text: `Your password reset code is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request this, please ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1a1a1a; font-size: 20px; margin: 0;">Password Reset</h2>
          <p style="color: #666; font-size: 14px; margin: 8px 0 0;">Wedding Ease</p>
        </div>
        <div style="background: #f8f4f2; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="color: #666; font-size: 14px; margin: 0 0 12px;">Your verification code is</p>
          <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #A17A63; font-family: monospace;">${otp}</div>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
          This code expires in 10 minutes.<br/>If you didn't request this, please ignore this email.
        </p>
      </div>
    `,
  })
}
