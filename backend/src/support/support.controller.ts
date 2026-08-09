import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { SupportService } from './support.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('chat')
  async chat(@CurrentUser() user: any, @Body('message') message: string, @Body('history') history: any[]) {
    return this.supportService.chat(user.id, message, history);
  }

  @Post('tickets')
  async createTicket(
    @CurrentUser() user: any,
    @Body('subject') subject: string,
    @Body('category') category: string,
    @Body('message') message: string,
  ) {
    return this.supportService.createTicket(user.id, subject, category, message);
  }

  @Get('tickets')
  async getTickets(@CurrentUser() user: any) {
    return this.supportService.getTickets(user.id);
  }

  @Get('tickets/:id/messages')
  async getTicketMessages(@CurrentUser() user: any, @Param('id') id: string) {
    return this.supportService.getTicketMessages(id, user.id);
  }
}
