import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import * as PDFDocument from 'pdfkit';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async getTransactions(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('week') week?: string,
    @Query('day') day?: string,
    @Query('type') type?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.transactionsService.getUserTransactionsFiltered(user.id, {
      page: pageNum,
      limit: limitNum,
      year: year ? parseInt(year, 10) : undefined,
      month: month ? parseInt(month, 10) : undefined,
      week: week ? parseInt(week, 10) : undefined,
      day,
      type,
    });
  }

  @Get('statement')
  async downloadStatement(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('format') format: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('week') week: string,
  ) {
    const transactions = await this.transactionsService.getUserTransactionsFiltered(user.id, {
      page: 1,
      limit: 1000,
      year: year ? parseInt(year, 10) : undefined,
      month: month ? parseInt(month, 10) : undefined,
      week: week ? parseInt(week, 10) : undefined,
    });
    const profile = await this.usersService.getProfile(user.id);
    const accountHolder = `${profile?.firstName || user.firstName || ''} ${profile?.lastName || user.lastName || ''}`.trim() || 'Account Holder';

    if (format === 'csv') {
      const rows = [
        ['SureXend Account Statement'],
        ['Account Holder', accountHolder],
        ['Email', profile?.email || user.email || '—'],
        ['SureX Tag', profile?.surexTag ? `@${profile.surexTag}` : '—'],
        ['Generated At', new Date().toISOString()],
        [],
        ['Reference', 'Type', 'Status', 'Amount', 'Currency', 'Fee', 'Created At'],
        ...transactions.transactions.map((t: any) => [
          t.reference, t.type, t.status, t.amount, t.currency, t.fee, new Date(t.createdAt).toISOString(),
        ]),
      ];
      const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="statement.csv"');
      return res.send(csv);
    }

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="statement.pdf"');
    doc.pipe(res);

    // Dark Background Page
    doc.rect(0, 0, 595, 842).fill('#0A0B0E');

    // Top Accent Bar
    doc.rect(0, 0, 595, 6).fill('#F59E0B');

    // Brand Header
    doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold').text('SUREXEND', 40, 24);
    doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text('FINANCIAL SYSTEMS · OFFICIAL ACCOUNT STATEMENT', 40, 48);

    doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold').text('ACCOUNT STATEMENT', 380, 24, { align: 'right' });
    doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text(`Issued: ${new Date().toLocaleDateString()}`, 380, 44, { align: 'right' });

    // Divider Line
    doc.moveTo(40, 62).lineTo(555, 62).strokeColor('#1E293B').lineWidth(1).stroke();

    // User Summary Card
    doc.roundedRect(40, 72, 515, 50, 6).fill('#121419');
    doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold').text(accountHolder, 52, 84);
    doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text(`${profile?.surexTag ? `@${profile.surexTag} · ` : ''}${profile?.email || user.email || '—'}`, 52, 100);
    doc.fillColor('#64748B').fontSize(7).font('Helvetica').text(`Account ID: ${profile?.id || user.id || '—'}`, 52, 112);

    const txList = transactions.transactions || [];
    const confirmedCount = txList.filter((t: any) => (t.status || '').toUpperCase() === 'COMPLETED').length;

    // Do not sum unlike currencies into a fake dollar total. The detailed rows
    // below preserve each transaction's native currency and exchange direction.
    doc.fillColor('#64748B').fontSize(7).text('RECORDS', 400, 84);
    doc.fillColor('#34D399').fontSize(10).font('Helvetica-Bold').text(`${txList.length}`, 400, 96);
    doc.fillColor('#64748B').fontSize(7).text('CONFIRMED', 480, 84);
    doc.fillColor('#34D399').fontSize(10).font('Helvetica-Bold').text(`${confirmedCount}`, 480, 96);

    // Table Header
    let y = 136;
    doc.rect(40, y, 515, 20).fill('#1E293B');
    doc.fillColor('#F59E0B').fontSize(8).font('Helvetica-Bold');
    doc.text('DATE', 48, y + 6);
    doc.text('TYPE', 120, y + 6);
    doc.text('REFERENCE', 210, y + 6);
    doc.text('STATUS', 370, y + 6);
    doc.text('AMOUNT', 480, y + 6, { align: 'right' });

    y += 20;
    txList.forEach((t: any, idx: number) => {
      if (y > 780) {
        doc.addPage();
        doc.rect(0, 0, 595, 842).fill('#0A0B0E');
        y = 40;
      }
      if (idx % 2 === 0) doc.rect(40, y, 515, 18).fill('#0F1117');
      doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica').text(new Date(t.createdAt).toLocaleDateString(), 48, y + 5);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').text(t.type, 120, y + 5);
      doc.fillColor('#64748B').font('Courier').text((t.reference || '').slice(0, 22), 210, y + 5);

      const st = (t.status || '').toUpperCase();
      doc.font('Helvetica-Bold');
      if (st === 'COMPLETED') doc.fillColor('#34D399').text('COMPLETED', 370, y + 5);
      else if (st === 'FAILED') doc.fillColor('#F87171').text('FAILED', 370, y + 5);
      else doc.fillColor('#F59E0B').text('PENDING', 370, y + 5);

      const code = (t.currency || 'USD').toUpperCase();
      const amtStr = Number(t.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const displayAmount = code === 'USD' ? `$${amtStr}` : (code === 'USDC' || code === 'USDT') ? `$${amtStr} ${code}` : `${amtStr} ${code}`;
      doc.fillColor('#FFFFFF').text(displayAmount, 480, y + 5, { align: 'right' });
      y += 18;
    });

    doc.fillColor('#475569').fontSize(7).font('Helvetica').text('SureXend Financial Systems · Official Bank Statement', 40, 810, { align: 'center' });
    doc.end();
  }

  @Get(':id')
  async getTransactionById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.transactionsService.getTransactionById(user.id, id);
  }
}
