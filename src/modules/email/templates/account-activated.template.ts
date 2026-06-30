import {
  escapeHtml,
  type RenderedEmail,
  wrapEmailHtml,
} from './email-layout.util';

export interface AccountActivatedTemplateContext {
  employeeName: string;
  organizationName: string;
  loginUrl: string;
}

export function renderAccountActivatedEmail(
  ctx: AccountActivatedTemplateContext,
): RenderedEmail {
  const subject = `Your ${ctx.organizationName} account is active`;
  const text = [
    `Hi ${ctx.employeeName},`,
    '',
    `Your account at ${ctx.organizationName} is now active.`,
    '',
    `You can sign in anytime at: ${ctx.loginUrl}`,
    '',
    'If you did not activate this account, contact your HR administrator immediately.',
  ].join('\n');

  const html = wrapEmailHtml(
    subject,
    `
      <p>Hi <strong>${escapeHtml(ctx.employeeName)}</strong>,</p>
      <p>Your account at <strong>${escapeHtml(ctx.organizationName)}</strong> is now active.</p>
      <p>You can sign in anytime using the link below:</p>
      <p><a href="${escapeHtml(ctx.loginUrl)}" style="display:inline-block;padding:12px 20px;background:#1e293b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Sign in to GhoulHR</a></p>
      <p style="font-size:13px;color:#64748b;">Or copy this URL: ${escapeHtml(ctx.loginUrl)}</p>
    `,
  );

  return { subject, text, html };
}
