import { Injectable, CanActivate, ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PinGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const { pin } = request.body;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!pin) {
      throw new BadRequestException('Transaction PIN is required');
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });

    // Testing mode: accept the default PIN if the user hasn't set a custom one yet
    const testing = this.configService.get<{ enabled: boolean; defaultPin: string }>('app.testing');
    if ((!dbUser || !dbUser.pin) && testing?.enabled) {
      if (pin.toString() !== testing.defaultPin) {
        throw new ForbiddenException('Invalid Transaction PIN');
      }
      return true;
    }

    if (!dbUser || !dbUser.pin) {
      throw new ForbiddenException('Transaction PIN is not set up');
    }

    const isValid = await bcrypt.compare(pin.toString(), dbUser.pin);
    if (!isValid) {
      throw new ForbiddenException('Invalid Transaction PIN');
    }

    return true;
  }
}
