import { Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: any, @Query('limit') limit?: string) {
    const notifications = await this.notificationsService.getNotifications(
      user.id,
      Math.min(parseInt(limit, 10) || 30, 100)
    );
    const unreadCount = await this.notificationsService.getUnreadCount(user.id);
    return { notifications, unreadCount };
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllRead(user.id);
  }
}
