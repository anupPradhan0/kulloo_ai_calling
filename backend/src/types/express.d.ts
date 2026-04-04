/**
 * Tells TypeScript that Express Request may carry a correlation identifier set by middleware.
 * This file only affects type checking; the actual assignment happens in correlation.middleware.ts at runtime.
 */

/** Extends Express `Request` with `correlationId` (set in `correlation.middleware.ts`). */
declare global {
  namespace Express {
    interface Request {
      /** Set by correlation middleware in app.ts */
      correlationId?: string;
    }
  }
}

export {};
