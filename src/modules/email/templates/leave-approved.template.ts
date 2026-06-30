import {
  escapeHtml,
  type RenderedEmail,
  wrapEmailHtml,
} from './email-layout.util';

export interface LeaveApprovedTemplateContext {
  recipientName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  notes?: string;
}

export function renderLeaveApprovedEmail(
  ctx: LeaveApprovedTemplateContext,
): RenderedEmail {
  const subject = `Your ${ctx.leaveType} request has been approved`;
  const notesLine = ctx.notes?.trim() ? `\nNote: ${ctx.notes.trim()}` : '';

  const text = [
    `Hi ${ctx.recipientName},`,
    '',
    'Good news — your leave request has been approved.',
    '',
    `Leave type: ${ctx.leaveType}`,
    `Dates: ${ctx.startDate} – ${ctx.endDate}${notesLine}`,
  ].join('\n');

  const html = wrapEmailHtml(
    subject,
    `
      <p>Hi <strong>${escapeHtml(ctx.recipientName)}</strong>,</p>
      <p style="color:#15803d;font-weight:600;">Your leave request has been approved.</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0;width:100%;">
        <tr><td style="padding:6px 0;color:#64748b;width:120px;">Leave type</td><td style="padding:6px 0;"><strong>${escapeHtml(ctx.leaveType)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Dates</td><td style="padding:6px 0;">${escapeHtml(ctx.startDate)} – ${escapeHtml(ctx.endDate)}</td></tr>
        ${
          ctx.notes?.trim()
            ? `<tr><td style="padding:6px 0;color:#64748b;">Note</td><td style="padding:6px 0;">${escapeHtml(ctx.notes.trim())}</td></tr>`
            : ''
        }
      </table>
    `,
  );

  return { subject, text, html };
}
