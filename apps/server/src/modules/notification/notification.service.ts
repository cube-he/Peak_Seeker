import { Injectable } from '@nestjs/common';
import { Subject, Observable, filter, map } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

export interface NotificationEvent {
  userId: number;
  type: string;
  title: string;
  content: string;
  refId?: number;
  refType?: string;
}

@Injectable()
export class NotificationService {
  private events$ = new Subject<NotificationEvent>();

  constructor(private prisma: PrismaService) {}

  async send(event: NotificationEvent): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: event.userId,
        type: event.type,
        title: event.title,
        content: event.content,
        refId: event.refId,
        refType: event.refType,
      },
    });
    this.events$.next(event);
  }

  getStream(userId: number): Observable<MessageEvent> {
    return this.events$.pipe(
      filter((event) => event.userId === userId),
      map(
        (event) =>
          ({ data: JSON.stringify(event), type: event.type }) as MessageEvent,
      ),
    );
  }

  async getUnread(userId: number) {
    return this.prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(userId: number, ids: number[]) {
    return this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
