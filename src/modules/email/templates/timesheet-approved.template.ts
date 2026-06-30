import {
  escapeHtml,
  type RenderedEmail,
  wrapEmailHtml,
} from './email-layout.util';

export interface TimesheetApprovedTemplateContext {
  employeeName: string;
  approverName: string;
  entries: Array<{ workDate: string; totalHours: number }>;
}

export function renderTimesheetApprovedEmail(
  ctx: TimesheetApprovedTemplateContext,
): RenderedEmail {
  const isSingle = ctx.entries.length === 1;
  const subject = isSingle
    ? `Timesheet approved for ${ctx.entries[0].workDate}`
    : `${ctx.entries.length} timesheets approved`;

  const lines = ctx.entries.map(
    (e) => `• ${e.workDate}: ${e.totalHours} hour(s)`,
  );

  const text = [
    `Hi ${ctx.employeeName},`,
    '',
    isSingle
      ? `Your timesheet has been approved by ${ctx.approverName}.`
      : `The following timesheets have been approved by ${ctx.approverName}:`,
    '',
    ...lines,
  ].join('\n');

  const rowsHtml = ctx.entries
    .map(
      (e) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(e.workDate)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(String(e.totalHours))} h</td>
        </tr>`,
    )
    .join('');

  const html = wrapEmailHtml(
    subject,
    `
      <p>Hi <strong>${escapeHtml(ctx.employeeName)}</strong>,</p>
      <p>${
        isSingle
          ? `Your timesheet has been approved by <strong>${escapeHtml(ctx.approverName)}</strong>.`
          : `The following timesheets have been approved by <strong>${escapeHtml(ctx.approverName)}</strong>:`
      }</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0;width:100%;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        <tr style="background:#f8fafc;">
          <th align="left" style="padding:8px 12px;font-size:13px;">Date</th>
          <th align="right" style="padding:8px 12px;font-size:13px;">Hours</th>
        </tr>
        ${rowsHtml}
      </table>
    `,
  );

  return { subject, text, html };
}
