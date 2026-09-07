import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, limit = 50): Promise<NotificationRow[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(this.toRow);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const row = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException("Notification not found");
    await this.prisma.notification.update({ where: { id }, data: { read: true, readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }

  private toRow(r: {
    id: string; type: string; title: string; body: string; data: unknown;
    read: boolean; readAt: Date | null; createdAt: Date;
  }): NotificationRow {
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      data: (r.data ?? {}) as Record<string, unknown>,
      read: r.read,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
