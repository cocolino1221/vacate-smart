import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/** Protecție simplă cu token (header `Authorization: Bearer <ADMIN_TOKEN>`). */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>('adminToken') ?? '';
    const header: string = ctx.switchToHttp().getRequest().headers['authorization'] ?? '';
    const given = header.replace(/^Bearer\s+/i, '');
    if (expected.length < 24) throw new UnauthorizedException('ADMIN_TOKEN neconfigurat (minim 24 caractere)');
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return true;
  }
}
