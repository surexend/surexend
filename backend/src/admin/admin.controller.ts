import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
  }

  @Get('users')
  listUsers(
    @Query('search') search?: string,
    @Query('kycStatus') kycStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listUsers({ search, kycStatus, page, limit });
  }

  @Get('users/:id')
  getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() body: { isActive?: boolean; isBanned?: boolean; kycStatus?: string; kycTier?: number; role?: string; email?: string; phone?: string }) {
    return this.adminService.updateUser(id, body);
  }

  @Post('users/:id/credit')
  creditBalance(@Param('id') id: string, @CurrentUser() admin: any, @Body() body: { amount: number; currency?: string; note?: string }) {
    return this.adminService.creditBalance(id, admin.id, body);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.adminService.deleteUser(id, admin.id);
  }

  @Get('transactions')
  listTransactions(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listTransactions({ type, status, search, page, limit });
  }

  @Get('kyc')
  listKyc(@Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.listKyc({ status, page, limit });
  }

  @Post('kyc/:id/decision')
  decideKyc(@Param('id') id: string, @Body() body: { approve: boolean; reason?: string }) {
    return this.adminService.decideKyc(id, body);
  }

  // ── Service pricing ─────────────────────────────────────────────────────

  @Get('pricing')
  getPricing() {
    return this.adminService.getPricing();
  }

  @Put('pricing/airtime')
  setAirtimePricing(@Body() body: { provider: string; marginPct: number }) {
    return this.adminService.setAirtimePricing(body.provider, body.marginPct);
  }

  @Put('pricing/data-margin')
  setDataMargin(@Body() body: { provider: string; marginPct: number }) {
    return this.adminService.setDataMargin(body.provider, body.marginPct);
  }

  @Put('pricing/data')
  setDataPlanPrice(@Body() body: { provider: string; planCode: string; sellPrice: number | null }) {
    return this.adminService.setDataPlanPrice(body.provider, body.planCode, body.sellPrice);
  }

  @Put('pricing/data-disable')
  setDataPlanEnabled(@Body() body: { provider: string; planCode: string; enabled: boolean }) {
    return this.adminService.setDataPlanEnabled(body.provider, body.planCode, body.enabled);
  }

  // ── Transaction detail (any user) ───────────────────────────────────────

  @Post('broadcast-message')
  broadcastMessage(@Body() body: { title: string; body: string; type?: string; data?: any }, @CurrentUser() admin: any) {
    return this.adminService.broadcastMessage(body, admin.id);
  }

  @Get('broadcast-message-history')
  getBroadcastHistory(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getBroadcastHistory({ page, limit });
  }
}