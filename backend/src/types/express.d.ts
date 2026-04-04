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
