import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private resend: Resend;
  private firebaseInitialized = false;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
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

  async sendOTPEmail(email: string, code: string): Promise<boolean> {
    const fromEmail = this.configService.get('app.resend.fromEmail') || 'noreply@surexend.com';
    if (!this.resend) {
      // Never silently drop the code. In dev we print it so flows stay testable;
      // in production we log loudly so a misconfigured server is impossible to miss.
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(`[DEV] Resend not configured — OTP for ${email}: ${code}`);
      } else {
        this.logger.error(`Cannot send OTP to ${email}: RESEND_API_KEY is not configured on this server.`);
      }
      return false;
    }
    try {
      await this.resend.emails.send({
        from: fromEmail,
        to: email,
        subject: 'Your SureXend OTP Code',
        html: this.getEmailTemplate(`<p>Your verification code is <strong style="color: #c0ff00; font-size: 24px;">${code}</strong>. It expires in 10 minutes.</p>`),
      });
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send OTP email to ${email}: ${error?.message || error}`);
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(`[DEV] Resend send failed — OTP for ${email}: ${code}`);
      }
      return false;
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

  // Persist an in-app notification to the DB (shown in the bell drawer)
  async createNotification(userId: string, payload: { title: string, body: string, type: string, data?: any }) {
    try {
      return await this.prisma.notification.create({
        data: {
          userId,
          title: payload.title,
          body: payload.body,
          type: payload.type,
          data: payload.data || {},
        }
      });
    } catch (error: any) {
      this.logger.error(`Failed to persist notification: ${error.message}`);
      return null;
    }
  }

  async getNotifications(userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false }
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });
    return { message: 'All notifications marked as read' };
  }

  async markRead(userId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    return { message: 'Notification marked as read' };
  }
}
