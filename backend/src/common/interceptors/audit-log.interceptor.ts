import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { ip, method, originalUrl, user } = request;
    const userAgent = request.get('user-agent') || '';

    return next.handle().pipe(
      tap(async () => {
        // Only log specific financial or critical routes if needed, or all POST/PUT/DELETE
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          await this.prisma.auditLog.create({
            data: {
              userId: user ? user.id : null,
              action: `${method} ${originalUrl}`,
              ipAddress: ip,
              userAgent,
              metadata: { body: request.body, query: request.query },
            },
          });
        }
      }),
    );
  }
}
