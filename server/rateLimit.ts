import type { NextFunction, Request, Response } from "express";

interface RateLimitOptions {
  windowMs: number;
  limit: number;
  code: string;
  message: string;
  maxKeys?: number;
}

interface Counter {
  count: number;
  resetsAt: number;
}

function requestKey(req: Request): string {
  // Express derives req.ip according to the configured trusted proxy hops. The
  // value is used only as an opaque key, so no address parsing can weaken an
  // SSRF or authorization boundary.
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function fixedWindowRateLimit(options: RateLimitOptions) {
  const counters = new Map<string, Counter>();
  const maxKeys = Math.max(100, options.maxKeys ?? 10_000);

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = requestKey(req);
    let counter = counters.get(key);
    if (!counter || counter.resetsAt <= now) {
      counter = { count: 0, resetsAt: now + options.windowMs };
      counters.delete(key);
      counters.set(key, counter);
    }
    counter.count += 1;

    if (counters.size > maxKeys) {
      for (const [candidate, value] of counters) {
        if (value.resetsAt <= now || counters.size > maxKeys) counters.delete(candidate);
        if (counters.size <= maxKeys) break;
      }
    }

    const remaining = Math.max(0, options.limit - counter.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((counter.resetsAt - now) / 1_000));
    res.setHeader("RateLimit-Limit", String(options.limit));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(retryAfterSeconds));

    if (counter.count > options.limit) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        error: { code: options.code, message: options.message, retryable: true },
      });
      return;
    }
    next();
  };
}
