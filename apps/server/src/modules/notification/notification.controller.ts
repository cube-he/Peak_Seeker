import {
  Controller,
  Get,
  Post,
  Body,
  Sse,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Sse('stream')
  stream(@Req() req): Observable<MessageEvent> {
    return this.notificationService.getStream(req.user.id);
  }

  @Get('unread')
  getUnread(@Req() req) {
    return this.notificationService.getUnread(req.user.id);
  }

  @Post('read')
  markAsRead(@Req() req, @Body() body: { ids: number[] }) {
    return this.notificationService.markAsRead(req.user.id, body.ids);
  }

  @Post('read-all')
  markAllAsRead(@Req() req) {
    return this.notificationService.markAllAsRead(req.user.id);
  }
}
