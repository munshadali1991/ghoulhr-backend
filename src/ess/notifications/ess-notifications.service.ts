import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { EmployeeNotification } from '../entities/employee-notification.entity';

const LIST_LIMIT = 50;

@Injectable()
export class EssNotificationsService {
  async list(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ) {
    const repo = dataSource.getRepository(EmployeeNotification);

    const [items, unreadCount] = await Promise.all([
      repo.find({
        where: {
          organizationId,
          recipientEmployeeId: employeeId,
        },
        order: { createdAt: 'DESC' },
        take: LIST_LIMIT,
      }),
      repo.count({
        where: {
          organizationId,
          recipientEmployeeId: employeeId,
          readAt: IsNull(),
        },
      }),
    ]);

    return {
      items: items.map((row) => this.mapToApi(row)),
      unreadCount,
    };
  }

  async getUnreadCount(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ) {
    const count = await dataSource.getRepository(EmployeeNotification).count({
      where: {
        organizationId,
        recipientEmployeeId: employeeId,
        readAt: IsNull(),
      },
    });
    return { unreadCount: count };
  }

  async markRead(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    notificationId: string,
  ) {
    const repo = dataSource.getRepository(EmployeeNotification);
    const row = await repo.findOne({
      where: {
        id: notificationId,
        organizationId,
        recipientEmployeeId: employeeId,
      },
    });

    if (!row) {
      throw new NotFoundException('Notification not found');
    }

    if (!row.readAt) {
      row.readAt = new Date();
      await repo.save(row);
    }

    return { item: this.mapToApi(row) };
  }

  async markAllRead(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ) {
    await dataSource.getRepository(EmployeeNotification).update(
      {
        organizationId,
        recipientEmployeeId: employeeId,
        readAt: IsNull(),
      },
      { readAt: new Date() },
    );
    return { success: true };
  }

  private mapToApi(row: EmployeeNotification) {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      leaveRequestId: row.leaveRequestId ?? null,
    };
  }
}
