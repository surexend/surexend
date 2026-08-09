import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async chat(userId: string, message: string, history: any[] = []) {
    const apiKey = this.configService.get('app.gemini.apiKey');
    if (!apiKey) throw new BadRequestException('Gemini API key not configured');

    const systemPrompt = `You are SureXend's AI support agent. SureXend is an Africa-first stablecoin spending platform. Users can send USDT/USDC to other wallets, convert to local fiat (NGN, GHS, KES, etc.), pay utility bills, airtime, data. You help users navigate the app, troubleshoot transactions, explain fees (1.2% conversion fee), explain KYC tiers (Tier 1: phone, Tier 2: NIN/BVN, Tier 3: passport). Escalate to human if: user reports fraud, account compromised, transaction stuck >24h, or explicitly asks for human. Return JSON: {"response": "string", "escalate": boolean}`;

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: '{"response": "Understood. How can I help you?", "escalate": false}' }] }
    ];

    history.forEach(msg => {
      contents.push({ role: msg.role === 'AI' ? 'model' : 'user', parts: [{ text: msg.content }] });
    });
    
    contents.push({ role: 'user', parts: [{ text: message }] });

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        { contents }
      );
      
      const candidate = response.data.candidates[0].content.parts[0].text;
      const jsonMatch = candidate.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { response: candidate, escalate: false };

      return parsed;
    } catch (error) {
      this.logger.error(`Gemini AI error: ${error.message}`);
      return { response: "I am having trouble connecting to my brain right now. An agent will be with you shortly.", escalate: true };
    }
  }

  async createTicket(userId: string, subject: string, category: string, message: string) {
    return this.prisma.supportTicket.create({
      data: {
        userId,
        subject,
        category,
        messages: {
          create: { role: 'USER', content: message }
        }
      },
      include: { messages: true }
    });
  }

  async getTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getTicketMessages(ticketId: string, userId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, userId } });
    if (!ticket) throw new BadRequestException('Ticket not found');

    return this.prisma.supportMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' }
    });
  }
}
