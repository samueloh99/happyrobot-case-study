import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Env } from '../config/env';
import { IS_PUBLIC_KEY } from '../health.controller';

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['authorization'];
    if (!header || Array.isArray(header)) throw new UnauthorizedException('missing authorization header');

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('expected Bearer token');
    }

    const expected = this.config.get('BACKEND_API_KEY', { infer: true });
    if (token !== expected) throw new UnauthorizedException('invalid token');

    return true;
  }
}
