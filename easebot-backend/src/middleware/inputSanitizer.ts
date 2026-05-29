import { Request, Response, NextFunction } from 'express';

/**
 * Denylist of field NAMES whose string values must be preserved verbatim
 * (typically large base64 payloads). Every OTHER string field on the request
 * body — at any depth — is sanitized.
 *
 * History: this used to be an allowlist (`SANITIZE_FIELDS = {message, prompt}`),
 * but that silently bypassed sanitization on history[].content, vibeTitle,
 * vibeDescriptors[], imageMimeType, language, threadId, etc. — letting NUL
 * bytes / ANSI escapes / C0 control chars reach the LLM, logs, and persistence.
 * The inversion makes "do not sanitize" the explicit exception.
 */
const PRESERVE_VERBATIM_FIELDS = new Set(['imageData', 'imageBase64', 'audioBase64']);

/**
 * Strip C0 control characters (0x00-0x1F) except whitespace we want to keep
 * (\t = 0x09, \n = 0x0A, \r = 0x0D), plus DEL (0x7F). The ANSI ESC byte (0x1B)
 * is in 0x00-0x1F so it's already covered — stripping it neutralises any
 * "ESC[31m"-style log-injection / terminal-hijack sequence at the source.
 * Printable Unicode (incl. emoji, non-Latin scripts) is preserved.
 */
function sanitizeString(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Recursively sanitize every string in `obj`, except those whose key is in
 * PRESERVE_VERBATIM_FIELDS. Walks plain objects + arrays. Non-string leaves
 * (numbers, booleans, null) are left alone.
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(obj)) {
    if (PRESERVE_VERBATIM_FIELDS.has(key)) {
      continue;
    }

    const value = obj[key];

    if (typeof value === 'string') {
      obj[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'string') {
          value[i] = sanitizeString(item);
        } else if (typeof item === 'object' && item !== null) {
          sanitizeObject(item as Record<string, unknown>);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      sanitizeObject(value as Record<string, unknown>);
    }
  }
  return obj;
}

/**
 * Express middleware that sanitizes every string in req.body.
 * - Strips C0 control characters (0x00-0x1F except \t, \n, \r) + DEL (0x7F).
 *   The ANSI ESC byte (0x1B) falls in this range and is therefore stripped.
 * - Trims surrounding whitespace.
 * - Recurses into nested objects + arrays (e.g. history[].content).
 * - Preserves base64 fields (imageData, imageBase64, audioBase64) verbatim.
 */
export function inputSanitizer(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body as Record<string, unknown>);
  }
  next();
}

// Test-only exports so unit tests can exercise sanitizeObject/sanitizeString
// directly without spinning up Express. Kept under __ prefix to mirror the
// convention used by userPrefsCache.ts and friends.
export const __sanitizeObjectForTests = sanitizeObject;
export const __sanitizeStringForTests = sanitizeString;
