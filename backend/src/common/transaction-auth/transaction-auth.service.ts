import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

// Single source of truth for "how do we authorize a money-moving action".
// Accepts either the user's 4-digit PIN or a short-lived biometric approval
// token issued by the passkeys module after a successful WebAuthn assertion.
// There is deliberately NO default/test PIN bypass here — every user must set
// a real PIN (or enroll a passkey) before they can transact.
@Injectable()
export class TransactionAuthService {
  constructor(private readonly jwtService: JwtService) {}

  async verify(
    user: { id: string; pin: string | null },
    body: { pin?: string; passkeyToken?: string },
  ) {
    const pin = body?.pin;
    const passkeyToken = body?.passkeyToken;

    if (!pin && !passkeyToken) {
      throw new BadRequestException('Transaction PIN or biometric approval is required');
    }

    if (passkeyToken) {
      try {
        const payload = this.jwtService.verify(passkeyToken);
        if (payload?.purpose !== 'transaction' || payload.sub !== user.id) {
          throw new ForbiddenException('Invalid or expired biometric approval');
        }
        return;
      } catch (err) {
        throw new ForbiddenException('Invalid or expired biometric approval');
      }
    }

    if (!user?.pin) {
      throw new ForbiddenException('Transaction PIN is not set up');
    }

    const isValid = await bcrypt.compare(pin.toString(), user.pin);
    if (!isValid) {
      throw new ForbiddenException('Invalid Transaction PIN');
    }
  }
}