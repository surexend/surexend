import { ThrottlerProxyGuard } from '../src/common/guards/throttler-proxy.guard';

// getTracker is protected on the base guard; expose it for testing.
class ExposedGuard extends ThrottlerProxyGuard {
  tracker(req: Record<string, any>): Promise<string> {
    return this.getTracker(req);
  }
}

describe('ThrottlerProxyGuard', () => {
  const guard = new ExposedGuard({} as any, {} as any, {} as any);

  it('uses the left-most forwarded address when behind a proxy', async () => {
    // The frontend reaches the API through a Next.js rewrite, so req.ip is the
    // proxy. Trusting the socket address would bucket every visitor together.
    const key = await guard.tracker({ ips: ['203.0.113.9', '10.0.0.1'], ip: '10.0.0.1' });
    expect(key).toBe('203.0.113.9');
  });

  it('falls back to the socket address when nothing is forwarded', async () => {
    const key = await guard.tracker({ ips: [], ip: '198.51.100.4' });
    expect(key).toBe('198.51.100.4');
  });

  it('never returns an empty bucket key', async () => {
    const key = await guard.tracker({});
    expect(key).toBe('unknown');
  });
});
