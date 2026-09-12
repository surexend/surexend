jest.mock('@circle-fin/bridge-kit', () => ({
  BridgeChain: {
    Arc_Testnet: 'ARC-TESTNET', Ethereum_Sepolia: 'ETH-SEPOLIA',
    Polygon_Amoy_Testnet: 'POLYGON-AMOY', Avalanche_Fuji: 'AVAX-FUJI',
    Arbitrum_Sepolia: 'ARB-SEPOLIA', Base_Sepolia: 'BASE-SEPOLIA',
    Optimism_Sepolia: 'OP-SEPOLIA', Solana_Devnet: 'SOL-DEVNET', Monad_Testnet: 'MONAD-TESTNET',
  },
  BridgeKit: jest.fn(),
}));
jest.mock('@circle-fin/adapter-circle-wallets', () => ({ createCircleWalletsAdapter: jest.fn() }));
jest.mock('@solana/web3.js', () => ({}));

import { BillsService } from '../src/bills/bills.service';
import { WalletsService } from '../src/wallets/wallets.service';

describe('manual provider reconciliation', () => {
  const evidence = { providerReference: 'provider-123', providerStatus: 'SUCCESS', note: 'Checked in provider console' };

  function makeBillsService(prisma: any, ledger: any = {}) {
    return new BillsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      ledger,
    );
  }

  function makeWalletsService(prisma: any) {
    const config = { get: jest.fn(() => undefined) };
    return new WalletsService(
      prisma,
      config as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('requires explicit provider evidence before a bill can be resolved', async () => {
    const prisma: any = { billPayment: { findUnique: jest.fn() } };
    const service = makeBillsService(prisma);
    await expect(service.resolvePendingBill('bill-1', 'COMPLETED', {})).rejects.toThrow('Provider reference and provider status');
    expect(prisma.billPayment.findUnique).not.toHaveBeenCalled();
  });

  it('settles a confirmed bill atomically without a second wallet credit', async () => {
    const bill = { id: 'bill-id', reference: 'bill-1', userId: 'user-1', status: 'PENDING', metadata: { reconciliationRequired: true } };
    const transaction = { id: 'tx-id', reference: 'bill-1', status: 'PENDING', metadata: { providerState: 'UNKNOWN_REQUIRES_RECONCILIATION' } };
    const billUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const txUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const prisma: any = {
      billPayment: { findUnique: jest.fn().mockResolvedValue(bill), updateMany: billUpdate },
      transaction: { findUnique: jest.fn().mockResolvedValue(transaction), updateMany: txUpdate },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    const result = await makeBillsService(prisma).resolvePendingBill('bill-1', 'completed', evidence);

    expect(result.status).toBe('COMPLETED');
    expect(billUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'bill-id', status: 'PENDING' }, data: expect.objectContaining({ status: 'COMPLETED' }) }));
    expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tx-id', status: 'PENDING' }, data: expect.objectContaining({ status: 'COMPLETED' }) }));
  });

  it('refunds a provider-confirmed bill failure through the ledger reversal path', async () => {
    const bill = { id: 'bill-id', reference: 'bill-1', userId: 'user-1', amount: 25, status: 'PENDING', metadata: {} };
    const pendingTransaction = { id: 'tx-id', reference: 'bill-1', userId: 'user-1', status: 'PENDING', metadata: {} };
    const billUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const txUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const ledgerReverse = jest.fn().mockResolvedValue(undefined);
    const prisma: any = {
      billPayment: { findUnique: jest.fn().mockResolvedValue(bill), updateMany: billUpdate },
      transaction: { findUnique: jest.fn().mockResolvedValueOnce(pendingTransaction).mockResolvedValueOnce({ status: 'FAILED' }), updateMany: txUpdate },
      wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'wallet-id' }), update: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'wallet-id', localBalances: { NGN: 100 }, localBalance: 100 }]),
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    const result = await makeBillsService(prisma, { reverse: ledgerReverse }).resolvePendingBill('bill-1', 'FAILED', evidence);

    expect(result.status).toBe('FAILED');
    expect(ledgerReverse).toHaveBeenCalledWith('bill-1', prisma);
    expect(billUpdate.mock.calls[0][0].data.status).toBe('FAILED');
    expect(txUpdate.mock.calls[0][0].data.status).toBe('FAILED');
  });

  it('requires explicit provider evidence before a send can be resolved', async () => {
    const prisma: any = { transaction: { findUnique: jest.fn() } };
    const service = makeWalletsService(prisma);
    await expect(service.resolvePendingSend('send-1', 'FAILED', {})).rejects.toThrow('Provider transaction reference and provider status');
    expect(prisma.transaction.findUnique).not.toHaveBeenCalled();
  });

  it('settles a confirmed send and releases only its lock', async () => {
    const tx = { id: 'tx-id', reference: 'send-1', userId: 'user-1', type: 'SEND', status: 'PENDING', amount: 8, fee: 2, metadata: {} };
    const txUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const walletUpdate = jest.fn().mockResolvedValue({});
    const prisma: any = {
      transaction: { findUnique: jest.fn().mockResolvedValue(tx), updateMany: txUpdate },
      wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'wallet-id' }), update: walletUpdate },
      $queryRaw: jest.fn().mockResolvedValue([{ lockedBalance: 10 }]),
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    const result = await makeWalletsService(prisma).resolvePendingSend('send-1', 'COMPLETED', evidence);

    expect(result.status).toBe('COMPLETED');
    expect(txUpdate.mock.calls[0][0].data.status).toBe('COMPLETED');
    expect(walletUpdate).toHaveBeenCalledWith({ where: { id: 'wallet-id' }, data: { lockedBalance: { decrement: 10 } } });
  });

  it('does not settle a send when its reservation is undersized', async () => {
    const tx = { id: 'tx-id', reference: 'send-1', userId: 'user-1', type: 'SEND', status: 'PENDING', amount: 8, fee: 2, metadata: {} };
    const txUpdate = jest.fn();
    const prisma: any = {
      transaction: { findUnique: jest.fn().mockResolvedValue(tx), updateMany: txUpdate },
      wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'wallet-id' }), update: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ lockedBalance: 9 }]),
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    await expect(makeWalletsService(prisma).resolvePendingSend('send-1', 'COMPLETED', evidence)).rejects.toThrow('reservation is smaller');
    expect(txUpdate).not.toHaveBeenCalled();
  });
});
