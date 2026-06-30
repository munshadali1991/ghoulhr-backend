import {
  escapeHtml,
  type RenderedEmail,
  wrapEmailHtml,
} from './email-layout.util';

export interface LeaveAppliedTemplateContext {
  approverName: string;
  applicantName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

export function renderLeaveAppliedEmail(
  ctx: LeaveAppliedTemplateContext,
): RenderedEmail {
  const subject = `Leave request from ${ctx.applicantName} — approval required`;
  const reasonLine = ctx.reason?.trim()
    ? `\nReason: ${ctx.reason.trim()}`
    : '';

  const text = [
    `Hi ${ctx.approverName},`,
    '',
    `${ctx.applicantName} has applied for leave and needs your approval.`,
    '',
    `Leave type: ${ctx.leaveType}`,
    `Dates: ${ctx.startDate} – ${ctx.endDate}${reasonLine}`,
    '',
    'Please review the request in GhoulHR under Approvals > Leave Requests.',
  ].join('\n');

  const html = wrapEmailHtml(
    subject,
    `
      <p>Hi <strong>${escapeHtml(ctx.approverName)}</strong>,</p>
      <p><strong>${escapeHtml(ctx.applicantName)}</strong> has applied for leave and needs your approval.</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0;width:100%;">
        <tr><td style="padding:6px 0;color:#64748b;width:120px;">Leave type</td><td style="padding:6px 0;"><strong>${escapeHtml(ctx.leaveType)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Dates</td><td style="padding:6px 0;">${escapeHtml(ctx.startDate)} – ${escapeHtml(ctx.endDate)}</td></tr>
        ${
          ctx.reason?.trim()
            ? `<tr><td style="padding:6px 0;color:#64748b;">Reason</td><td style="padding:6px 0;">${escapeHtml(ctx.reason.trim())}</td></tr>`
            : ''
        }
      </table>
      <p>Please review the request in <strong>Approvals &gt; Leave Requests</strong>.</p>
    `,
  );

  return { subject, text, html };
}
