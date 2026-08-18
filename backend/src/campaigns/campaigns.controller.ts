import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get('leaderboard')
  async getLeaderboard(@Query('type') type: string, @Query('range') range: string) {
    return this.campaignsService.getLeaderboard(type, range);
  }

  @Get('me')
  async getMyStanding(@CurrentUser() user: any) {
    return this.campaignsService.getMyStanding(user.id);
  }
}
