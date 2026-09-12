jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

import { Logger } from '@nestjs/common';
import axios from 'axios';
import { LedgerAlertService } from '../src/common/ledger-alert.service';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LedgerAlertService', () => {
  const auditFindMany = jest.fn();
  const deliveryUpsert = jest.fn();
  const deliveryFindMany = jest.fn();
  const deliveryUpdate = jest.fn();
  const prisma: any = {
    auditLog: { findMany: auditFindMany },
    ledgerAlertDelivery: { upsert: deliveryUpsert, findMany: deliveryFindMany, update: deliveryUpdate },
  };

  const config = (overrides: Record<string, any> = {}) =>
    ({
      get: jest.fn((path: string) => {
        const table: Record<string, any> = {
          'app.ledger.alerts': { enabled: true, webhookUrl: undefined, email: undefined, ...overrides },
          'app.resend.apiKey': undefined,
          'app.resend.fromEmail': 'noreply@surexend.com',
        };
        return table[path];
      }),
    }) as any;

  const driftRow = (id: string, createdAt = new Date()) => ({
    id,
    action: 'LEDGER_DRIFT',
    createdAt,
    metadata: { account: 'user:u1:USDC', currency: 'USDC', ledgerMinor: '5000000', legacy: 5.5 },
  });

  const delivery = (row: any, channel = 'WEBHOOK', attempts = 0) => ({
    id: `delivery-${row.id}-${channel}`,
    channel,
    attempts,
    auditLog: row,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockReset();
    deliveryUpsert.mockResolvedValue({});
    deliveryUpdate.mockResolvedValue({});
    deliveryFindMany.mockResolvedValue([]);
  });

  it('does nothing when alerts are disabled', async () => {
    const service = new LedgerAlertService(prisma, config({ enabled: false }));
    await service.checkForDrift();
    expect(auditFindMany).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does nothing when there are no drift rows', async () => {
    auditFindMany.mockResolvedValue([]);
    const service = new LedgerAlertService(prisma, config());
    await service.checkForDrift();
    expect(auditFindMany).toHaveBeenCalledTimes(1);
    expect(deliveryUpsert).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('persists and POSTs each new drift row to the configured webhook', async () => {
    const rows = [driftRow('a1'), driftRow('a2')];
    auditFindMany.mockResolvedValue(rows);
    deliveryFindMany.mockResolvedValue(rows.map((row) => delivery(row)));
    mockedAxios.post.mockResolvedValue({ status: 200 } as any);
    const service = new LedgerAlertService(prisma, config({ webhookUrl: 'https://hooks.example.com/drift' }));

    await service.checkForDrift();

    expect(deliveryUpsert).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post.mock.calls[0][0]).toBe('https://hooks.example.com/drift');
    expect((mockedAxios.post.mock.calls[0][1] as any).event).toBe('LEDGER_DRIFT');
    expect((mockedAxios.post.mock.calls[0][1] as any).rows[0].id).toBe('a1');
    expect(deliveryUpdate).toHaveBeenCalledTimes(2);
    expect(deliveryUpdate.mock.calls[0][0].data.status).toBe('DELIVERED');
  });

  it('retries a failed channel through durable delivery state', async () => {
    const row = driftRow('a1');
    auditFindMany.mockResolvedValue(row ? [row] : []);
    deliveryFindMany.mockResolvedValue([delivery(row, 'WEBHOOK', 0)]);
    mockedAxios.post.mockRejectedValueOnce(new Error('network down'));
    const service = new LedgerAlertService(prisma, config({ webhookUrl: 'https://hooks.example.com/drift' }));

    await expect(service.checkForDrift()).resolves.toBeUndefined();
    expect(deliveryUpdate.mock.calls[0][0].data).toEqual(expect.objectContaining({ status: 'RETRY', attempts: 1 }));
    expect(deliveryUpdate.mock.calls[0][0].data.nextAttemptAt).toBeInstanceOf(Date);

    // A later process can consume the persisted RETRY row and mark it
    // delivered; no in-memory high-water mark is required for correctness.
    deliveryFindMany.mockResolvedValueOnce([delivery(row, 'WEBHOOK', 1)]);
    mockedAxios.post.mockResolvedValueOnce({ status: 200 } as any);
    await service.checkForDrift();
    expect(deliveryUpdate.mock.calls[1][0].data.status).toBe('DELIVERED');
  });

  it('emits an explicit log when no alert destination is configured', async () => {
    auditFindMany.mockResolvedValue([driftRow('a1')]);
    const errorSpy = jest.spyOn(Logger.prototype, 'error');
    const service = new LedgerAlertService(prisma, config());
    await service.checkForDrift();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no alert destination'));
    expect(deliveryUpsert).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('survives a DB query failure without throwing', async () => {
    auditFindMany.mockRejectedValue(new Error('db unreachable'));
    const service = new LedgerAlertService(prisma, config());
    await expect(service.checkForDrift()).resolves.toBeUndefined();
  });

  it('queries durable delivery state with a retryable status and due time', async () => {
    auditFindMany.mockResolvedValue([driftRow('a1')]);
    const service = new LedgerAlertService(prisma, config({ webhookUrl: 'https://hooks.example.com/drift' }));
    await service.checkForDrift();
    const args = deliveryFindMany.mock.calls[0][0];
    expect(args.where.status.in).toEqual(['PENDING', 'RETRY']);
    expect(args.where.nextAttemptAt.lte).toBeInstanceOf(Date);
    expect(args.where.auditLog.action).toBe('LEDGER_DRIFT');
    expect(args.include.auditLog.select.id).toBe(true);
  });
});
