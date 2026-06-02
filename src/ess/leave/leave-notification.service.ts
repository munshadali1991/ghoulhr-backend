import { Injectable } from '@nestjs/common';
import { EntityManager, In, Not } from 'typeorm';
import { EmailService } from '../../modules/email/email.service';
import { Employee, EmployeeStatus } from '../../employees/employee.entity';
import {
  EmployeeNotification,
  EmployeeNotificationType,
} from '../entities/employee-notification.entity';
import { LeaveRequest } from '../entities/leave-request.entity';

const NOTIFICATION_BATCH_SIZE = 100;

export interface BroadcastLeaveAppliedParams {
  organizationId: string;
  leaveRequest: LeaveRequest;
  applicant: Employee;
  leaveTypeName: string;
  ccEmployeeIds?: string[];
}

@Injectable()
export class LeaveNotificationService {
  constructor(private readonly emailService: EmailService) {}

  async broadcastLeaveApplied(
    em: EntityManager,
    params: BroadcastLeaveAppliedParams,
  ): Promise<void> {
    const {
      organizationId,
      leaveRequest,
      applicant,
      leaveTypeName,
      ccEmployeeIds = [],
    } = params;

    const uniqueCcIds = [...new Set(ccEmployeeIds.filter((id) => id !== applicant.id))];

    let recipients: Pick<Employee, 'id' | 'name' | 'email'>[];

    if (uniqueCcIds.length > 0) {
      recipients = await em.getRepository(Employee).find({
        where: {
          id: In(uniqueCcIds),
          status: In([
            EmployeeStatus.ACTIVE,
            EmployeeStatus.PENDING_ACTIVATION,
          ]),
        },
        select: ['id', 'name', 'email'],
      });
    } else if (leaveRequest.notifyAllEmployees) {
      recipients = await em.getRepository(Employee).find({
        where: {
          status: EmployeeStatus.ACTIVE,
          id: Not(applicant.id),
        },
        select: ['id', 'name', 'email'],
      });
    } else {
      return;
    }

    if (recipients.length === 0) {
      return;
    }

    const startDate = formatLeaveDate(leaveRequest.startDate);
    const endDate = formatLeaveDate(leaveRequest.endDate);
    const body = `${applicant.name} applied for ${leaveTypeName} (${startDate} – ${endDate})`;
    const title = 'Leave notice';

    const notificationRepo = em.getRepository(EmployeeNotification);

    for (let i = 0; i < recipients.length; i += NOTIFICATION_BATCH_SIZE) {
      const chunk = recipients.slice(i, i + NOTIFICATION_BATCH_SIZE);
      await notificationRepo.insert(
        chunk.map((recipient) => ({
          organizationId,
          recipientEmployeeId: recipient.id,
          leaveRequestId: leaveRequest.id,
          type: EmployeeNotificationType.LEAVE_APPLIED,
          title,
          body,
        })),
      );
    }

    await Promise.all(
      recipients.map((recipient) =>
        this.emailService.sendLeaveAppliedNotification({
          to: recipient.email,
          recipientName: recipient.name,
          applicantName: applicant.name,
          leaveType: leaveTypeName,
          startDate,
          endDate,
          body,
        }),
      ),
    );
  }
}

function formatLeaveDate(value: string | Date): string {
  const iso =
    typeof value === 'string'
      ? value
      : (value as Date).toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${d} ${months[m - 1]} ${y}`;
}
