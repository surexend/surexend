import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { cookieTokenExtractor } from './auth-cookies';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const secret = configService.get<string>('app.jwt.secret') || process.env.JWT_SECRET;
    if (!secret) {
      // No fallback secret: a hardcoded default would let anyone mint a valid
      // token for any user id. main.ts fails the boot before we get here.
      throw new Error('JWT_SECRET is not configured');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieTokenExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    
    return user;
  }
}
