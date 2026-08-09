import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ConversionsService } from './conversions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateConversionDto, PreviewConversionDto } from './dto/create-conversion.dto';

@Controller('conversions')
@UseGuards(JwtAuthGuard)
export class ConversionsController {
  constructor(private readonly conversionsService: ConversionsService) {}

  @Get('rates')
  async getRates(@Query('currency') currency: string) {
    return this.conversionsService.getRates(currency);
  }

  @Post('preview')
  async preview(@Body() dto: PreviewConversionDto) {
    return this.conversionsService.preview(dto.usdtAmount, dto.fiatCurrency);
  }

  @Post('execute')
  async execute(@CurrentUser() user: any, @Body() dto: CreateConversionDto) {
    return this.conversionsService.execute(
      user.id,
      dto.usdtAmount,
      dto.fiatCurrency,
      dto.bankAccountId,
      dto.pin
    );
  }
}
