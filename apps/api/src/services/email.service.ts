import { getConfig } from '@wsaas/config';
import { createLogger } from '@wsaas/logger';

const logger = createLogger({ name: 'api:email' });

// ─── Email Service ─────────────────────────────────────────────────────────────
// Wraps Resend for sending transactional emails.
// In development, logs emails instead of sending them when RESEND_API_KEY not set.

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const config = getConfig();

  if (!config.RESEND_API_KEY) {
    // Development: log the email instead of sending
    logger.info(
      {
        to: options.to,
        subject: options.subject,
        preview: options.html.replace(/<[^>]*>/g, '').slice(0, 200),
      },
      '📧 [DEV] Email would be sent (RESEND_API_KEY not configured)',
    );
    return;
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(config.RESEND_API_KEY);

    const result = await resend.emails.send({
      from: `${config.EMAIL_FROM_NAME} <${config.EMAIL_FROM ?? 'noreply@example.com'}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      reply_to: options.replyTo ?? config.EMAIL_REPLY_TO,
    });

    logger.info({ to: options.to, subject: options.subject, id: result.data?.id }, 'Email sent');
  } catch (err) {
    logger.error({ err, to: options.to, subject: options.subject }, 'Failed to send email');
    // Don't throw — email failures should not break the request flow
    // The user can request a resend
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────
// Simple inline HTML templates. Phase 10 replaces these with React Email.

const APP_NAME = () => getConfig().APP_NAME;
const APP_URL = () => getConfig().APP_URL;
const SUPPORT_EMAIL = () => getConfig().SUPPORT_EMAIL;

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME()}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: #16a34a; padding: 32px 40px; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 700; }
    .body { padding: 40px; }
    .body p { color: #374151; line-height: 1.6; margin: 0 0 16px; }
    .button { display: inline-block; background: #16a34a; color: #fff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0; }
    .code { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 24px; font-size: 28px; font-weight: 700; letter-spacing: 8px; color: #111827; text-align: center; margin: 24px 0; font-family: monospace; }
    .footer { padding: 24px 40px; border-top: 1px solid #f3f4f6; }
    .footer p { color: #9ca3af; font-size: 13px; margin: 0; }
    .divider { border: none; border-top: 1px solid #f3f4f6; margin: 24px 0; }
    .small { font-size: 13px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${APP_NAME()}</h1>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} ${APP_NAME()}. All rights reserved.</p>
      <p>Questions? <a href="mailto:${SUPPORT_EMAIL()}" style="color:#16a34a">${SUPPORT_EMAIL()}</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ── Specific Email Senders ────────────────────────────────────────────────────

export async function sendVerificationEmail(options: {
  to: string;
  firstName: string;
  verificationUrl: string;
}): Promise<void> {
  await sendEmail({
    to: options.to,
    subject: `Verify your ${APP_NAME()} email address`,
    html: baseTemplate(`
      <p>Hi ${options.firstName},</p>
      <p>Welcome to ${APP_NAME()}! Please verify your email address to get started.</p>
      <p style="text-align:center">
        <a href="${options.verificationUrl}" class="button">Verify Email Address</a>
      </p>
      <hr class="divider">
      <p class="small">This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
      <p class="small">If the button doesn't work, copy this URL: ${options.verificationUrl}</p>
    `),
  });
}

export async function sendWelcomeEmail(options: {
  to: string;
  firstName: string;
}): Promise<void> {
  await sendEmail({
    to: options.to,
    subject: `Welcome to ${APP_NAME()} 🎉`,
    html: baseTemplate(`
      <p>Hi ${options.firstName},</p>
      <p>Your email is verified and your free trial has started. Here's how to get up and running in 5 minutes:</p>
      <p><strong>Step 1:</strong> Create a WhatsApp instance in your dashboard</p>
      <p><strong>Step 2:</strong> Scan the QR code with your WhatsApp phone</p>
      <p><strong>Step 3:</strong> Use your API key to send your first message</p>
      <p style="text-align:center">
        <a href="${APP_URL()}/dashboard" class="button">Go to Dashboard</a>
      </p>
      <hr class="divider">
      <p class="small">Your trial includes 100 messages and 1 instance for 7 days. No credit card required.</p>
    `),
  });
}

export async function sendPasswordResetEmail(options: {
  to: string;
  firstName: string;
  resetUrl: string;
}): Promise<void> {
  await sendEmail({
    to: options.to,
    subject: `Reset your ${APP_NAME()} password`,
    html: baseTemplate(`
      <p>Hi ${options.firstName},</p>
      <p>We received a request to reset your password. Click the button below to set a new one.</p>
      <p style="text-align:center">
        <a href="${options.resetUrl}" class="button">Reset Password</a>
      </p>
      <hr class="divider">
      <p class="small">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>
      <p class="small">If the button doesn't work, copy this URL: ${options.resetUrl}</p>
    `),
  });
}

export async function sendPasswordChangedEmail(options: {
  to: string;
  firstName: string;
}): Promise<void> {
  await sendEmail({
    to: options.to,
    subject: `Your ${APP_NAME()} password was changed`,
    html: baseTemplate(`
      <p>Hi ${options.firstName},</p>
      <p>Your password was successfully changed. All active sessions have been signed out.</p>
      <p>If you made this change, no action is needed.</p>
      <p>If you did not change your password, please contact us immediately at <a href="mailto:${SUPPORT_EMAIL()}" style="color:#16a34a">${SUPPORT_EMAIL()}</a>.</p>
    `),
  });
}

export async function sendLoginAlertEmail(options: {
  to: string;
  firstName: string;
  ipAddress: string;
  userAgent: string;
  time: Date;
}): Promise<void> {
  await sendEmail({
    to: options.to,
    subject: `New sign-in to your ${APP_NAME()} account`,
    html: baseTemplate(`
      <p>Hi ${options.firstName},</p>
      <p>We noticed a new sign-in to your account from a new device or location.</p>
      <p><strong>Time:</strong> ${options.time.toUTCString()}</p>
      <p><strong>IP Address:</strong> ${options.ipAddress}</p>
      <p><strong>Device:</strong> ${options.userAgent.slice(0, 100)}</p>
      <hr class="divider">
      <p>If this was you, no action is needed.</p>
      <p>If you don't recognize this sign-in, please <a href="${APP_URL()}/dashboard/settings/security" style="color:#16a34a">secure your account</a> immediately.</p>
    `),
  });
}

export async function sendTrialEndingEmail(options: {
  to: string;
  firstName: string;
  trialEndsAt: Date;
}): Promise<void> {
  const daysLeft = Math.ceil(
    (options.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  await sendEmail({
    to: options.to,
    subject: `Your ${APP_NAME()} trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
    html: baseTemplate(`
      <p>Hi ${options.firstName},</p>
      <p>Your free trial ends on <strong>${options.trialEndsAt.toDateString()}</strong> — that's ${daysLeft} day${daysLeft !== 1 ? 's' : ''} from now.</p>
      <p>Upgrade now to keep your instance connected and avoid any interruption.</p>
      <p style="text-align:center">
        <a href="${APP_URL()}/dashboard/billing/upgrade" class="button">Upgrade Your Plan</a>
      </p>
      <hr class="divider">
      <p class="small">Starter plan starts at $29/month with 5,000 messages and 1 instance.</p>
    `),
  });
}

export async function sendTrialExpiredEmail(options: {
  to: string;
  firstName: string;
}): Promise<void> {
  await sendEmail({
    to: options.to,
    subject: `Your ${APP_NAME()} trial has ended`,
    html: baseTemplate(`
      <p>Hi ${options.firstName},</p>
      <p>Your free trial has ended. Your WhatsApp instances are temporarily paused.</p>
      <p>Upgrade to a paid plan to restore access and continue sending messages.</p>
      <p style="text-align:center">
        <a href="${APP_URL()}/dashboard/billing/upgrade" class="button">Choose a Plan</a>
      </p>
    `),
  });
}

export async function sendPaymentFailedEmail(options: {
  to: string;
  firstName: string;
  attemptNumber: number;
  nextRetry?: Date;
}): Promise<void> {
  await sendEmail({
    to: options.to,
    subject: `Payment failed — action required for ${APP_NAME()}`,
    html: baseTemplate(`
      <p>Hi ${options.firstName},</p>
      <p>We were unable to process your payment (attempt ${options.attemptNumber} of 3).</p>
      ${options.nextRetry ? `<p>We'll try again on ${options.nextRetry.toDateString()}.</p>` : '<p>This was our final attempt. Your account will be suspended shortly.</p>'}
      <p>Please update your payment method to avoid service interruption.</p>
      <p style="text-align:center">
        <a href="${APP_URL()}/dashboard/billing" class="button">Update Payment Method</a>
      </p>
    `),
  });
}

export async function sendTeamInviteEmail(options: {
  to: string;
  inviterName: string;
  companyName: string | null;
  role: string;
  acceptUrl: string;
}): Promise<void> {
  await sendEmail({
    to: options.to,
    subject: `${options.inviterName} invited you to join ${options.companyName ?? APP_NAME()}`,
    html: baseTemplate(`
      <p>${options.inviterName} has invited you to join their team on ${APP_NAME()} as a <strong>${options.role.toLowerCase()}</strong>.</p>
      ${options.companyName ? `<p>Team: <strong>${options.companyName}</strong></p>` : ''}
      <p style="text-align:center">
        <a href="${options.acceptUrl}" class="button">Accept Invitation</a>
      </p>
      <hr class="divider">
      <p class="small">This invitation expires in 48 hours. If you weren't expecting this, you can ignore it.</p>
    `),
  });
}
