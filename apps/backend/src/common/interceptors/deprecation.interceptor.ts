import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  DEPRECATED_KEY,
  DEPRECATION_META_KEY,
  DeprecationOptions,
} from '../decorators/deprecated.decorator';

/**
 * DeprecationInterceptor
 * Automatically adds Deprecation and Sunset headers to any route
 * decorated with @Deprecated(). Also logs a warning on each call
 * so deprecated usage is visible in server logs.
 */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DeprecationInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const isDeprecated = this.reflector.getAllAndOverride<boolean>(
      DEPRECATED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isDeprecated) {
      return next.handle();
    }

    const meta = this.reflector.getAllAndOverride<DeprecationOptions>(
      DEPRECATION_META_KEY,
      [context.getHandler(), context.getClass()],
    );

    const response = context.switchToHttp().getResponse();
    const request = context.switchToHttp().getRequest();

    // Set standard Deprecation header (RFC 8594)
    response.setHeader('Deprecation', `version="${meta.since}"`);

    if (meta.removeIn) {
      response.setHeader('Sunset', `version="${meta.removeIn}"`);
    }

    if (meta.replacement) {
      response.setHeader('Link', `<${meta.replacement}>; rel="successor-version"`);
    }

    // Warn in server logs
    this.logger.warn(
      `Deprecated endpoint called: ${request.method} ${request.url} — ` +
        `deprecated since ${meta.since}` +
        (meta.removeIn ? `, removal planned in ${meta.removeIn}` : '') +
        (meta.replacement ? `, use ${meta.replacement} instead` : ''),
    );

    return next.handle().pipe(
      tap(() => {
        // Headers already set above; hook kept for future metrics
      }),
    );
  }
}