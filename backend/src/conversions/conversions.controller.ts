import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ConversionsService } from './conversions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateConversionDto, PreviewConversionDto } from './dto/create-conversion.dto';

@Controller('conversions')
@UseGuards(JwtAuthGuard)
export class ConversionsController {
  constructor(private readonly conversionsService: ConversionsService) {}

  @Get('currencies')
  async getCurrencies() {
    return this.conversionsService.getSupportedCurrencies();
  }

  @Get('rates')
  async getRates(@Query('currency') currency: string) {
    return this.conversionsService.getRates(currency);
  }

  @Post('preview')
  async preview(@Body() dto: PreviewConversionDto) {
    return this.conversionsService.preview(dto.from, dto.to, dto.amount);
  }

  @Post('execute')
  async execute(@CurrentUser() user: any, @Body() dto: CreateConversionDto) {
    return this.conversionsService.execute(
      user.id,
      dto.from,
      dto.to,
      dto.amount,
      dto.pin
    );
  }
}
