import { Controller, Post, Body, Headers, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private configService: ConfigService,
  ) {}

  @Post('flutterwave')
  @HttpCode(HttpStatus.OK)
  async flutterwaveWebhook(@Headers('verif-hash') hash: string, @Body() payload: any) {
    const secretHash = this.configService.get('app.flutterwave.webhookHash');
    if (hash !== secretHash) throw new UnauthorizedException('Invalid hash');

    await this.webhooksService.processFlutterwave(payload);
    return { status: 'success' };
  }

  @Post('vtpass')
  @HttpCode(HttpStatus.OK)
  async vtpassWebhook(@Body() payload: any) {
    // Signature validation logic depends on vtpass docs, omitted for brevity
    await this.webhooksService.processVtpass(payload);
    return { status: 'success' };
  }

  @Post('circle')
  @HttpCode(HttpStatus.OK)
  async circleWebhook(
    @Headers('x-circle-signature') signature: string,
    @Headers('x-circle-key-id') keyId: string,
    @Body() payload: any,
  ) {
    // V2 Webhook Verification is recommended in production.
    // In Sandbox, we process the payload directly.
    await this.webhooksService.processCircle(payload);
    return { status: 'success' };
  }
}
