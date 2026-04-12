import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

interface ErrorResponse {
  error: string;
  code: string;
  requestId?: string;
}

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
}

/**
 * Global Express error handler.
 *
 * - Logs every error with a timestamp
 * - Returns a structured JSON response with error, code, and optional requestId
 * - Maps known error types to appropriate HTTP status codes
 * - Never exposes stack traces in production
 */
export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const timestamp = new Date().toISOString();
  const isProduction = process.env.NODE_ENV === 'production';

  // Detect client-disconnect errors. These happen when the client closes the
  // connection mid-request (navigation, tab close, network blip) and are NOT
  // real errors — they're especially common on the SSE /chat/stream endpoint.
  // Cases covered:
  //   - body-parser: `{ type: 'request.aborted', message: 'request aborted' }`
  //   - node http: `err.code === 'ECONNABORTED' | 'ECONNRESET'`
  //   - express: `err.type === 'request.aborted'`
  //   - generic aborted/closed request after res has been detached
  const isClientDisconnect =
    err.message === 'request aborted' ||
    err.code === 'ECONNABORTED' ||
    err.code === 'ECONNRESET' ||
    (err as unknown as { type?: string }).type === 'request.aborted' ||
    req.aborted === true ||
    (!res.writableEnded && (res as unknown as { writable?: boolean }).writable === false);

  if (isClientDisconnect) {
    // Info-level log: visible but clearly not an error.
    console.info(`[${timestamp}] Client disconnected on ${req.method} ${req.originalUrl}: ${err.message}`);
    // If headers are already sent (common for SSE), there's nothing more to do.
    if (res.headersSent) {
      return;
    }
    // Otherwise fall through to send a 499-ish response — but the client is
    // gone so most frameworks just swallow it. We short-circuit instead.
    try { res.status(499).end(); } catch { /* ignore */ }
    return;
  }

  // Log the error
  console.error(`[${timestamp}] Error processing ${req.method} ${req.originalUrl}:`, {
    message: err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });

  // Determine status code and error code
  let statusCode: number;
  let errorCode: string;
  let errorMessage: string;

  if (err instanceof ZodError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = 'Request validation failed';
  } else if (err.status === 401 || err.statusCode === 401 || err.message?.toLowerCase().includes('unauthorized')) {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    errorMessage = 'Authentication required';
  } else if (err.status === 404 || err.statusCode === 404 || err.message?.toLowerCase().includes('not found')) {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
    errorMessage = 'Resource not found';
  } else if (err.status === 429 || err.statusCode === 429) {
    statusCode = 429;
    errorCode = 'RATE_LIMITED';
    errorMessage = 'Too many requests';
  } else if (err.message?.includes('not allowed by CORS')) {
    statusCode = 403;
    errorCode = 'CORS_BLOCKED';
    errorMessage = 'Origin not allowed';
  } else {
    statusCode = err.status ?? err.statusCode ?? 500;
    errorCode = err.code ?? 'INTERNAL_ERROR';
    errorMessage = isProduction ? 'An internal error occurred' : (err.message || 'An internal error occurred');
  }

  const response: ErrorResponse = {
    error: errorMessage,
    code: errorCode,
  };

  // Attach requestId if present on the request (set by upstream middleware)
  const requestId = (req as unknown as Record<string, unknown>).requestId;
  if (typeof requestId === 'string') {
    response.requestId = requestId;
  }

  res.status(statusCode).json(response);
}
