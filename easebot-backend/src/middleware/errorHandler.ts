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
