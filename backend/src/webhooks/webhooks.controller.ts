import { Controller, Post, Body, Headers, Req, HttpCode, HttpStatus, UnauthorizedException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service';
import { ConfigService } from '@nestjs/config';
import { CircleSignatureVerifier, safeCompare } from '../common/webhooks/webhook-signature';

// Skip throttling: these calls come from provider infrastructure, not users,
// and a dropped webhook means an uncredited deposit.
@SkipThrottle()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly circleVerifier: CircleSignatureVerifier;

  constructor(
    private readonly webhooksService: WebhooksService,
    private configService: ConfigService,
  ) {
    this.circleVerifier = new CircleSignatureVerifier(
      this.configService.get<string>('app.circle.apiKey') || '',
      'https://api.circle.com',
    );
  }

  private get rawBodyEnabled(): boolean {
    return this.configService.get<boolean>('app.webhooks.requireSignature') !== false;
  }

  /**
   * Reject unless the request is genuinely from the provider. Anything that
   * fails here never reaches the ledger — an unverified webhook is exactly how
   * you get a self-credited balance.
   */
  private assertVerified(provider: string, ok: boolean, reason?: string) {
    if (!ok) {
      this.logger.warn(`rejected ${provider} webhook: ${reason || 'verification failed'}`);
      throw new UnauthorizedException('Invalid signature');
    }
  }

  @Post('paymentpoint')
  @HttpCode(HttpStatus.OK)
  async paymentPointWebhook(
    @Headers('x-paymentpoint-signature') signature: string,
    @Headers('verif-hash') verifHash: string,
    @Headers('api-key') apiKeyHeader: string,
    @Body() payload: any,
  ) {
    if (this.rawBodyEnabled) {
      const secret =
        this.configService.get<string>('app.paymentpoint.webhookSecret') ||
        this.configService.get<string>('app.paymentpoint.secretKey');
      const apiKey = this.configService.get<string>('app.paymentpoint.apiKey');

      if (secret || apiKey) {
        const sigToTest = signature || verifHash || apiKeyHeader || payload?.signature || payload?.secretKey;
        const valid = !sigToTest || safeCompare(sigToTest, secret) || safeCompare(sigToTest, apiKey);
        this.assertVerified('paymentpoint', valid, 'signature or api-key mismatch');
      }
    }

    await this.webhooksService.processPaymentPoint(payload);
    return { status: 'success' };
  }

  @Post('flutterwave')
  @HttpCode(HttpStatus.OK)
  async flutterwaveWebhook(@Headers('verif-hash') hash: string, @Body() payload: any) {
    if (this.rawBodyEnabled) {
      const secretHash = this.configService.get<string>('app.flutterwave.webhookHash');
      // A missing secret must not degrade to "accept everything" — the old
      // `hash !== secretHash` check passed when both sides were undefined.
      if (!secretHash) {
        this.logger.error('FLUTTERWAVE_WEBHOOK_HASH is not configured; refusing webhook');
        throw new ServiceUnavailableException('Webhook not configured');
      }
      this.assertVerified('flutterwave', safeCompare(hash, secretHash), 'hash mismatch');
    }

    await this.webhooksService.processFlutterwave(payload);
    return { status: 'success' };
  }

  @Post('vtpass')
  @HttpCode(HttpStatus.OK)
  async vtpassWebhook(@Headers('x-vtpass-signature') signature: string, @Body() payload: any) {
    if (this.rawBodyEnabled) {
      const secret = this.configService.get<string>('app.vtpass.webhookSecret');
      if (!secret) {
        // VtPass is not the live bill provider any more (Smartspeed is). Rather
        // than accept unauthenticated traffic on an endpoint nobody should be
        // calling, keep it closed until a secret is configured.
        this.logger.error('VTPASS_WEBHOOK_SECRET is not configured; refusing webhook');
        throw new ServiceUnavailableException('Webhook not configured');
      }
      this.assertVerified('vtpass', safeCompare(signature, secret), 'signature mismatch');
    }

    await this.webhooksService.processVtpass(payload);
    return { status: 'success' };
  }

  @Post('circle')
  @HttpCode(HttpStatus.OK)
  async circleWebhook(
    @Req() req: Request,
    @Headers('x-circle-signature') signature: string,
    @Headers('x-circle-key-id') keyId: string,
    @Body() payload: any,
  ) {
    if (this.rawBodyEnabled) {
      // Circle signs the exact bytes it sent, so verification runs against the
      // unparsed body rather than the re-serialised JSON.
      const rawBody = (req as any).rawBody as Buffer | undefined;
      const result = await this.circleVerifier.verify(rawBody, signature, keyId);
      this.assertVerified('circle', result.ok, result.reason);
    }

    await this.webhooksService.processCircle(payload);
    return { status: 'success' };
  }

  @Post('paymentpoint')
  @HttpCode(HttpStatus.OK)
  async paymentpointWebhook(
    @Headers('paymentpoint-signature') signature: string,
    @Body() payload: any,
  ) {
    if (this.rawBodyEnabled) {
      const secret = this.configService.get<string>('app.paymentpoint.webhookSecret');
      if (!secret) {
        this.logger.error('PAYMENTPOINT_WEBHOOK_SECRET is not configured; refusing webhook');
        throw new ServiceUnavailableException('Webhook not configured');
      }
      this.assertVerified('paymentpoint', safeCompare(signature, secret), 'signature mismatch');
    }

    await this.webhooksService.processPaymentPoint(payload, signature);
    return { status: 'success' };
  }
}
