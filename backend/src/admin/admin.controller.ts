import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
}