import { Request, Response, NextFunction } from 'express';

/** Fields that contain base64 data and should not be sanitized. */
const BASE64_FIELDS = new Set(['imageData', 'imageBase64', 'audioBase64']);

/** Fields whose string values should be sanitized. */
const SANITIZE_FIELDS = new Set(['message', 'prompt']);

/**
 * Strip control characters (except newlines \n and tabs \t) from a string,
 * then trim leading/trailing whitespace.
 */
function sanitizeString(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Recursively sanitize string fields named `message` or `prompt` within an object.
 * Skips base64 fields entirely.
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(obj)) {
    if (BASE64_FIELDS.has(key)) {
      continue;
    }

    const value = obj[key];

    if (typeof value === 'string' && SANITIZE_FIELDS.has(key)) {
      obj[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === 'object' && value[i] !== null) {
          sanitizeObject(value[i] as Record<string, unknown>);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      sanitizeObject(value as Record<string, unknown>);
    }
  }
  return obj;
}

/**
 * Express middleware that sanitizes string fields in req.body.
 * - Strips control characters (except \n and \t)
 * - Trims whitespace
 * - Applies to `message` and `prompt` fields recursively
 * - Does NOT modify base64 fields (imageData, imageBase64, audioBase64)
 */
export function inputSanitizer(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body as Record<string, unknown>);
  }
  next();
}
