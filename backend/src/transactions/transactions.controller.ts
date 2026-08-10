import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as PDFDocument from 'pdfkit';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

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

    if (format === 'csv') {
      const rows = [
        ['Reference', 'Type', 'Status', 'Amount', 'Currency', 'Fee', 'Created At'],
        ...transactions.transactions.map((t: any) => [
          t.reference, t.type, t.status, t.amount, t.currency, t.fee, t.createdAt.toISOString(),
        ]),
      ];
      const csv = rows.map(r => r.join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="statement.csv"');
      return res.send(csv);
    }

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="statement.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('SureXend Account Statement', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(10);
    transactions.transactions.forEach((t: any) => {
      doc.text(
        `${t.createdAt.toISOString().slice(0, 10)}  ${t.type.padEnd(16)}  ${t.status.padEnd(10)}  ${t.amount} ${t.currency}  ${t.reference}`
      );
    });

    doc.end();
  }

  @Get(':id')
  async getTransactionById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.transactionsService.getTransactionById(user.id, id);
  }
}
