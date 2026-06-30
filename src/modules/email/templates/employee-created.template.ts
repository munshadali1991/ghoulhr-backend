import {
  escapeHtml,
  type RenderedEmail,
  wrapEmailHtml,
} from './email-layout.util';

export interface EmployeeCreatedTemplateContext {
  employeeName: string;
  organizationName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  departmentName?: string;
  designationName?: string;
}

export function renderEmployeeCreatedEmail(
  ctx: EmployeeCreatedTemplateContext,
): RenderedEmail {
  const subject = `Welcome to ${ctx.organizationName} — your account is ready`;
  const roleLine = [
    ctx.departmentName ? `Department: ${ctx.departmentName}` : null,
    ctx.designationName ? `Designation: ${ctx.designationName}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const text = [
    `Hi ${ctx.employeeName},`,
    '',
    `Your employee account at ${ctx.organizationName} has been created.`,
    roleLine,
    '',
    `Login URL: ${ctx.loginUrl}`,
    `Email: ${ctx.email}`,
    `Temporary password: ${ctx.temporaryPassword}`,
    '',
    'You must change your password on first login.',
    '',
    'If you did not expect this email, contact your HR administrator.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const html = wrapEmailHtml(
    subject,
    `
      <p>Hi <strong>${escapeHtml(ctx.employeeName)}</strong>,</p>
      <p>Your employee account at <strong>${escapeHtml(ctx.organizationName)}</strong> has been created.</p>
      ${
        roleLine
          ? `<p style="margin:16px 0;padding:12px 16px;background:#f8fafc;border-radius:6px;">${escapeHtml(roleLine).replace(/\n/g, '<br/>')}</p>`
          : ''
      }
      <p><strong>Login URL:</strong> <a href="${escapeHtml(ctx.loginUrl)}">${escapeHtml(ctx.loginUrl)}</a></p>
      <p><strong>Email:</strong> ${escapeHtml(ctx.email)}</p>
      <p><strong>Temporary password:</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${escapeHtml(ctx.temporaryPassword)}</code></p>
      <p style="color:#b45309;">You must change your password on first login.</p>
    `,
  );

  return { subject, text, html };
}
