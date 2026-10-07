import { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  enabled: boolean;
  tokensPerMinute: number;
  burst: number;
  now?: () => number;
}

interface BucketState {
  tokens: number;
  lastRefillAt: number;
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const buckets = new Map<string, BucketState>();
  const now = options.now ?? (() => Date.now());
  const refillPerMs = options.tokensPerMinute / 60_000;

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    if (!options.enabled) {
      next();
      return;
    }

    const key = `${req.ip}:${req.method}:${req.route?.path ?? req.path}`;
    const timestamp = now();
    const existing = buckets.get(key) ?? { tokens: options.burst, lastRefillAt: timestamp };
    const elapsed = Math.max(timestamp - existing.lastRefillAt, 0);
    const refilledTokens = Math.min(options.burst, existing.tokens + elapsed * refillPerMs);

    if (refilledTokens < 1) {
      buckets.set(key, { tokens: refilledTokens, lastRefillAt: timestamp });
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Rate limit exceeded.',
        },
      });
      return;
    }

    buckets.set(key, { tokens: refilledTokens - 1, lastRefillAt: timestamp });
    next();
  };
}
