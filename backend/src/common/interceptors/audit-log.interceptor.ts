import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'pin',
  'currentpin',
  'newpin',
  'code',
  'token',
  'accesstoken',
  'refreshtoken',
  'passkeytoken',
  'authorization',
  'entitysecretciphertext',
  'twofactorsecret',
  'secret',
  'otpauthurl',
]);

type AuditJson = string | number | boolean | null | AuditJson[] | { [key: string]: AuditJson };

function sanitizeForAudit(value: unknown): AuditJson {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForAudit(item));
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const normalized = key.toLowerCase();
      if (SENSITIVE_KEYS.has(normalized)) {
        return [key, REDACTED];
      }
      return [key, sanitizeForAudit(entry)];
    }),
  ) as { [key: string]: AuditJson };
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { ip, method, originalUrl, user } = request;
    const userAgent = request.get('user-agent') || '';

    return next.handle().pipe(
      tap(() => {
        // Only log specific financial or critical routes if needed, or all POST/PUT/DELETE
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          void this.prisma.auditLog.create({
            data: {
              userId: user ? user.id : null,
              action: `${method} ${originalUrl}`,
              ipAddress: ip,
              userAgent,
              metadata: {
                body: sanitizeForAudit(request.body),
                query: sanitizeForAudit(request.query),
              } as any,
            },
          }).catch((error) => {
            this.logger.error(`Failed to write audit log: ${error.message}`);
          });
        }
      }),
    );
  }
}
