import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import axios from 'axios';
import * as admin from 'firebase-admin';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private resend: Resend;
  private firebaseInitialized = false;

  constructor(private configService: ConfigService) {
    const resendKey = this.configService.get('app.resend.apiKey');
    if (resendKey) {
      this.resend = new Resend(resendKey);
    }
    
    const firebaseConfig = this.configService.get('app.firebase');
    if (firebaseConfig.projectId && firebaseConfig.privateKey) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: firebaseConfig.projectId,
            clientEmail: firebaseConfig.clientEmail,
            privateKey: firebaseConfig.privateKey,
          }),
        });
        this.firebaseInitialized = true;
      } catch (err) {
        this.logger.error('Firebase initialization failed', err);
      }
    }
  }

  private getEmailTemplate(content: string) {
    return `
      <div style="font-family: Arial, sans-serif; background-color: #121212; color: #ffffff; padding: 20px;">
        <div style="text-align: center; padding-bottom: 20px;">
          <h1 style="color: #c0ff00;">SureXend</h1>
        </div>
        <div style="background-color: #1e1e1e; padding: 20px; border-radius: 8px;">
          ${content}
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #888;">
          &copy; ${new Date().getFullYear()} SureXend. All rights reserved.
        </div>
      </div>
    `;
  }

  async sendOTPEmail(email: string, code: string) {
    if (!this.resend) return;
    const content = `<p>Your verification code is <strong style="color: #c0ff00; font-size: 24px;">${code}</strong>. It expires in 10 minutes.</p>`;
    try {
      await this.resend.emails.send({
        from: this.configService.get('app.resend.fromEmail') || 'noreply@surexend.com',
        to: email,
        subject: 'Your SureXend OTP Code',
        html: this.getEmailTemplate(content),
      });
    } catch (error) {
      this.logger.error(`Failed to send OTP email: ${error.message}`);
    }
  }

  async sendOTPSMS(phone: string, code: string) {
    const apiKey = this.configService.get('app.termii.apiKey');
    if (!apiKey) return;

    try {
      await axios.post('https://api.ng.termii.com/api/sms/send', {
        to: phone,
        from: 'SureXend',
        sms: `Your SureXend verification code is ${code}. It expires in 10 minutes.`,
        type: 'plain',
        channel: 'generic',
        api_key: apiKey,
      });
    } catch (error) {
      this.logger.error(`Failed to send OTP SMS: ${error.message}`);
    }
  }

  async sendTransactionEmail(email: string, amount: number, currency: string, reference: string, type: string) {
    if (!this.resend) return;
    const content = `
      <h2>Transaction Successful</h2>
      <p>Type: ${type}</p>
      <p>Amount: <strong style="color: #c0ff00;">${amount} ${currency}</strong></p>
      <p>Reference: ${reference}</p>
    `;
    try {
      await this.resend.emails.send({
        from: this.configService.get('app.resend.fromEmail') || 'noreply@surexend.com',
        to: email,
        subject: `Transaction Successful: ${type}`,
        html: this.getEmailTemplate(content),
      });
    } catch (error) {
      this.logger.error(`Failed to send tx email: ${error.message}`);
    }
  }

  async sendPushNotification(userId: string, payload: { title: string, body: string, data: any }) {
    if (!this.firebaseInitialized) return;
    // Real implementation would fetch user's FCM tokens from DB
    try {
      const message = {
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
        topic: `user-${userId}` // Assuming users subscribe to their own topic
      };
      await admin.messaging().send(message);
    } catch (error) {
      this.logger.error(`Failed to send push notification: ${error.message}`);
    }
  }
}
