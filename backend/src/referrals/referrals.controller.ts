import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('stats')
  async getStats(@CurrentUser() user: any) {
    return this.referralsService.getStats(user.id);
  }

  @Get()
  async getReferrals(
    @CurrentUser() user: any,
    @Query('page') page: string,
    @Query('limit') limit: string
  ) {
    return this.referralsService.getReferrals(user.id, parseInt(page) || 1, parseInt(limit) || 10);
  }

  @Get('earnings')
  async getEarnings(@CurrentUser() user: any) {
    return this.referralsService.getEarningsBreakdown(user.id);
  }
}
