import {
  escapeHtml,
  type RenderedEmail,
  wrapEmailHtml,
} from './email-layout.util';

export interface PendingLeaveSummaryItem {
  applicantName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
}

export interface PendingLeaveApprovalReminderTemplateContext {
  approverName: string;
  pendingCount: number;
  approvalsUrl: string;
  items: PendingLeaveSummaryItem[];
}

export function renderPendingLeaveApprovalReminderEmail(
  ctx: PendingLeaveApprovalReminderTemplateContext,
): RenderedEmail {
  const countLabel =
    ctx.pendingCount === 1
      ? '1 leave request'
      : `${ctx.pendingCount} leave requests`;
  const subject = `Action needed: ${countLabel} pending before month end`;

  const listLines =
    ctx.items.length > 0
      ? ctx.items.map(
          (item) =>
            `- ${item.applicantName}: ${item.leaveType} (${item.startDate} – ${item.endDate})`,
        )
      : ['- (See Approvals in GhoulHR for the full list)'];

  const text = [
    `Hi ${ctx.approverName},`,
    '',
    `You have ${countLabel} awaiting your approval before month end.`,
    '',
    'Pending requests:',
    ...listLines,
    '',
    `Please review them here: ${ctx.approvalsUrl}`,
    '',
    'Approving outstanding leave before the month closes keeps balances and reports accurate.',
  ].join('\n');

  const rowsHtml = ctx.items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.applicantName)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.leaveType)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.startDate)} – ${escapeHtml(item.endDate)}</td>
        </tr>`,
    )
    .join('');

  const tableHtml =
    ctx.items.length > 0
      ? `
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0;width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#64748b;border-bottom:1px solid #e2e8f0;">Employee</td>
          <td style="padding:6px 0;color:#64748b;border-bottom:1px solid #e2e8f0;">Leave type</td>
          <td style="padding:6px 0;color:#64748b;border-bottom:1px solid #e2e8f0;">Dates</td>
        </tr>
        ${rowsHtml}
      </table>`
      : '';

  const moreNote =
    ctx.pendingCount > ctx.items.length
      ? `<p style="font-size:13px;color:#64748b;">Showing ${ctx.items.length} of ${ctx.pendingCount}. Open Approvals for the full list.</p>`
      : '';

  const html = wrapEmailHtml(
    subject,
    `
      <p>Hi <strong>${escapeHtml(ctx.approverName)}</strong>,</p>
      <p>You have <strong>${escapeHtml(countLabel)}</strong> awaiting your approval before month end.</p>
      ${tableHtml}
      ${moreNote}
      <p>Please review them in <strong>Approvals &gt; Leave Requests</strong>:</p>
      <p><a href="${escapeHtml(ctx.approvalsUrl)}" style="display:inline-block;padding:12px 20px;background:#1e293b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Review leave requests</a></p>
      <p style="font-size:13px;color:#64748b;">Or copy this URL: ${escapeHtml(ctx.approvalsUrl)}</p>
      <p style="font-size:13px;color:#64748b;">Approving outstanding leave before the month closes keeps balances and reports accurate.</p>
    `,
  );

  return { subject, text, html };
}
