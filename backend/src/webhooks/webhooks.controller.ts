import { Controller, Post, Body, Headers, Req, HttpCode, HttpStatus, UnauthorizedException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service';
import { ConfigService } from '@nestjs/config';
import { CircleSignatureVerifier, safeCompare, verifyHmacSha256 } from '../common/webhooks/webhook-signature';

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

  @Post('flutterwave')
  @HttpCode(HttpStatus.OK)
  async flutterwaveWebhook(
    @Req() req: Request,
    @Headers('flutterwave-signature') signature: string,
    @Headers('verif-hash') legacyHash: string,
    @Body() payload: any,
  ) {
    if (this.configService.get<boolean>('app.flutterwave.enabled') !== true) {
      throw new ServiceUnavailableException('Flutterwave webhook is disabled; PaymentPoint is the selected funding provider.');
    }
    if (this.rawBodyEnabled) {
      const secretHash = this.configService.get<string>('app.flutterwave.webhookHash');
      // Current Flutterwave webhooks use HMAC-SHA256 over the raw body and the
      // `flutterwave-signature` header. Older accounts use `verif-hash` as a
      // static secret value; support that legacy mode only when the current
      // signature header is absent, and never accept a missing secret.
      if (!secretHash) {
        this.logger.error('FLUTTERWAVE_WEBHOOK_HASH is not configured; refusing webhook');
        throw new ServiceUnavailableException('Webhook not configured');
      }
      const rawBody = (req as any).rawBody as Buffer | undefined;
      const verified = signature
        ? verifyHmacSha256(rawBody, signature, secretHash)
        : safeCompare(legacyHash, secretHash);
      this.assertVerified('flutterwave', verified, signature ? 'HMAC signature mismatch' : 'legacy hash mismatch');
    }

    await this.webhooksService.processFlutterwave(payload);
    return { status: 'success' };
  }

  @Post('vtpass')
  @HttpCode(HttpStatus.OK)
  async vtpassWebhook(@Headers('x-vtpass-signature') signature: string, @Body() payload: any) {
    if (this.rawBodyEnabled) {
      const enabled = this.configService.get<boolean>('app.vtpass.webhookEnabled') === true;
      const secret = this.configService.get<string>('app.vtpass.webhookSecret');
      if (!enabled || !secret) {
        // VtPass is not the live bill provider any more (Smartspeed is). Keep
        // this route closed until its callback authentication contract is
        // independently verified and explicitly enabled.
        this.logger.error('VTPASS webhook is not explicitly enabled and configured; refusing webhook');
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
    @Headers('paymentpoint-signature') paymentPointSignature: string,
    @Headers('x-paymentpoint-signature') xPaymentPointSignature: string,
    @Headers('verif-hash') verifHash: string,
    @Body() payload: any,
  ) {
    if (this.rawBodyEnabled) {
      const providers = this.configService.get<string[]>('app.providers.enabled') || [];
      const enabled = providers.includes('paymentpoint')
        && this.configService.get<boolean>('app.paymentpoint.webhookEnabled') === true;
      const secret = this.configService.get<string>('app.paymentpoint.webhookSecret');
      if (!enabled || !secret) {
        // PaymentPoint's public material available to this audit did not
        // establish a signature algorithm/header contract. Do not let a
        // guessed static comparison credit real funds by default.
        this.logger.error('PaymentPoint webhook is not explicitly enabled and configured; refusing webhook');
        throw new ServiceUnavailableException('Webhook not configured');
      }
      const provided = paymentPointSignature || xPaymentPointSignature || verifHash;
      this.assertVerified('paymentpoint', safeCompare(provided, secret), 'signature mismatch or missing signature');
    }

    await this.webhooksService.processPaymentPoint(payload, paymentPointSignature || xPaymentPointSignature || verifHash);
    return { status: 'success' };
  }
}
