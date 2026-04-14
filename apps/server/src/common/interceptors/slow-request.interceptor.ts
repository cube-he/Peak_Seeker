import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Log requests that exceed a duration threshold.
 * Helps identify performance bottlenecks in production.
 *
 * Default threshold: 1000ms (configurable via SLOW_REQUEST_THRESHOLD_MS env var).
 */
@Injectable()
export class SlowRequestInterceptor implements NestInterceptor {
  private readonly logger = new Logger('SlowRequest');
  private readonly thresholdMs: number;

  constructor() {
    this.thresholdMs = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS || '1000', 10);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const userId = request.user?.sub ?? request.user?.id ?? 'anonymous';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        if (duration >= this.thresholdMs) {
          this.logger.warn(
            `Slow request: ${method} ${url} | ${duration}ms | user: ${userId}`,
          );
        }
      }),
    );
  }
}
