import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, Request, HttpCode, HttpStatus } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { NotificationsService } from "./notifications.service";
import { NotificationPreferenceService, type ChannelPreference, type QuietHoursDto } from "./notification-preference.service";
import { NotificationPushService } from "./delivery/push.service";

interface AuthRequest {
  user: { id: string };
}

@Controller("notifications")
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly preferences: NotificationPreferenceService,
    private readonly push: NotificationPushService,
  ) {}

  @Get()
  list(@Request() req: AuthRequest, @Query("limit") limit?: string) {
    return this.notifications.list(req.user.id, limit ? Number(limit) : undefined);
  }

  @Get("unread-count")
  unreadCount(@Request() req: AuthRequest) {
    return this.notifications.unreadCount(req.user.id).then((count) => ({ count }));
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@Request() req: AuthRequest, @Param("id") id: string) {
    return this.notifications.markRead(req.user.id, id);
  }

  @Post("read-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(@Request() req: AuthRequest) {
    return this.notifications.markAllRead(req.user.id);
  }

  @Get("preferences")
  listPreferences(@Request() req: AuthRequest) {
    return this.preferences.listForUser(req.user.id);
  }

  @Put("preferences")
  upsertPreference(@Request() req: AuthRequest, @Body() dto: ChannelPreference) {
    return this.preferences.upsert(req.user.id, dto);
  }

  @Get("quiet-hours")
  getQuietHours(@Request() req: AuthRequest) {
    return this.preferences.getQuietHours(req.user.id);
  }

  @Put("quiet-hours")
  setQuietHours(@Request() req: AuthRequest, @Body() dto: QuietHoursDto) {
    return this.preferences.setQuietHours(req.user.id, dto);
  }

  @Post("push-token")
  @HttpCode(HttpStatus.NO_CONTENT)
  registerPushToken(@Request() req: AuthRequest, @Body() dto: { token: string }) {
    return this.push.registerToken(req.user.id, dto.token);
  }
}
