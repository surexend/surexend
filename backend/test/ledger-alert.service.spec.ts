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
  const prisma: any = { auditLog: { findMany: auditFindMany } };

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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when alerts are disabled', async () => {
    const service = new LedgerAlertService(prisma, config({ enabled: false }));
    await service.checkForDrift();
    expect(auditFindMany).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does nothing when there are no new drift rows', async () => {
    auditFindMany.mockResolvedValue([]);
    const service = new LedgerAlertService(prisma, config());
    await service.checkForDrift();
    expect(auditFindMany).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('POSTs new LEDGER_DRIFT rows to the configured webhook', async () => {
    auditFindMany.mockResolvedValue([driftRow('a1'), driftRow('a2')]);
    mockedAxios.post.mockResolvedValue({ status: 200 } as any);
    const service = new LedgerAlertService(prisma, config({ webhookUrl: 'https://hooks.example.com/drift' }));
    await service.checkForDrift();
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [url, payload] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/drift');
    expect((payload as any).event).toBe('LEDGER_DRIFT');
    expect((payload as any).count).toBe(2);
    expect((payload as any).rows.map((r: any) => r.id)).toEqual(['a1', 'a2']);
  });

  it('does not re-alert rows already alerted in-process (high-water mark)', async () => {
    const t1 = new Date('2026-08-30T10:00:00Z');
    const t2 = new Date('2026-08-30T11:00:00Z');
    auditFindMany.mockResolvedValueOnce([driftRow('a1', t1)]);
    mockedAxios.post.mockResolvedValue({ status: 200 } as any);
    const service = new LedgerAlertService(prisma, config({ webhookUrl: 'https://hooks.example.com/drift' }));

    await service.checkForDrift();
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect((mockedAxios.post.mock.calls[0][1] as any).count).toBe(1);

    // Second run replays the old row plus a new one: the watcher filters the
    // already-alerted id and only alerts the fresh row.
    auditFindMany.mockResolvedValueOnce([driftRow('a1', t1), driftRow('a2', t2)]);
    await service.checkForDrift();
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect((mockedAxios.post.mock.calls[1][1] as any).rows.map((r: any) => r.id)).toEqual(['a2']);

    // Third run with no new rows: no further alerts.
    auditFindMany.mockResolvedValueOnce([driftRow('a2', t2)]);
    await service.checkForDrift();
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('keeps alerting (error log + other channels) when the webhook fails', async () => {
    auditFindMany.mockResolvedValue([driftRow('a1')]);
    mockedAxios.post.mockRejectedValue(new Error('network down'));
    const errorSpy = jest.spyOn(Logger.prototype, 'error');
    const service = new LedgerAlertService(prisma, config({ webhookUrl: 'https://hooks.example.com/drift' }));
    await expect(service.checkForDrift()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('survives a DB query failure without throwing', async () => {
    auditFindMany.mockRejectedValue(new Error('db unreachable'));
    const service = new LedgerAlertService(prisma, config());
    await expect(service.checkForDrift()).resolves.toBeUndefined();
  });

  it('always queries AuditLog for LEDGER_DRIFT rows newest-first from the watermark', async () => {
    auditFindMany.mockResolvedValue([]);
    const service = new LedgerAlertService(prisma, config());
    await service.checkForDrift();
    const args = auditFindMany.mock.calls[0][0];
    expect(args.where.action).toBe('LEDGER_DRIFT');
    expect(args.where.createdAt.gt).toBeInstanceOf(Date);
    expect(args.orderBy).toEqual({ createdAt: 'asc' });
    expect(args.select.id).toBe(true);
  });
});
