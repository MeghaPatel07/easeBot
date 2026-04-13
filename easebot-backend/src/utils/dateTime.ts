/**
 * Date/time utilities for the reminders system.
 *
 * We avoid bringing in date-fns-tz to keep dependencies minimal — instead we
 * use the platform `Intl.DateTimeFormat` with `timeZoneName: 'longOffset'` to
 * compute the offset of a given IANA zone for a specific instant.
 */

/**
 * Resolve the UTC offset (in minutes) of the given IANA zone at the given
 * UTC instant. Positive = ahead of UTC.
 *
 * Example: zoneOffsetMinutes('Asia/Kolkata', anyDate) === 330
 */
function zoneOffsetMinutes(ianaZone: string, atUtc: Date): number {
  // 'longOffset' yields strings like 'GMT+05:30' / 'GMT-04:00' / 'GMT'
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaZone,
    timeZoneName: 'longOffset',
  })
  const parts = fmt.formatToParts(atUtc)
  const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(tzPart)
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  const hours = parseInt(m[2], 10)
  const minutes = m[3] ? parseInt(m[3], 10) : 0
  return sign * (hours * 60 + minutes)
}

/**
 * Convert a wall-clock date (YYYY-MM-DD) and optional time (HH:mm) in the
 * given IANA zone to a UTC `Date`. If `timeStr` is null, defaults to 09:00
 * local time (a sensible "morning of" anchor for all-day reminders).
 */
export function computeEventInstant(
  dateStr: string,
  timeStr: string | null,
  ianaZone: string,
): Date {
  const [yStr, moStr, dStr] = dateStr.split('-')
  const y = parseInt(yStr, 10)
  const mo = parseInt(moStr, 10)
  const d = parseInt(dStr, 10)
  let hh = 9
  let mm = 0
  if (timeStr) {
    const [hStr, mStr] = timeStr.split(':')
    hh = parseInt(hStr, 10)
    mm = parseInt(mStr, 10)
  }
  // Construct the candidate as if the wall time were UTC, then subtract the
  // zone offset to get the true UTC instant. We do one offset lookup against
  // the candidate UTC instant (close enough for non-DST-transition minutes;
  // for DST edges we re-resolve once for stability).
  const candidateUtcMs = Date.UTC(y, mo - 1, d, hh, mm, 0, 0)
  const offset1 = zoneOffsetMinutes(ianaZone, new Date(candidateUtcMs))
  const adjustedMs = candidateUtcMs - offset1 * 60_000
  // Re-check the offset at the adjusted instant in case we crossed a DST edge.
  const offset2 = zoneOffsetMinutes(ianaZone, new Date(adjustedMs))
  if (offset2 === offset1) return new Date(adjustedMs)
  return new Date(candidateUtcMs - offset2 * 60_000)
}

/**
 * Render a UTC instant as a human-friendly string in the given zone.
 * Example: "Friday, May 10, 2026 at 4:00 PM IST"
 */
export function formatHumanDate(
  utcDate: Date,
  ianaZone: string,
  includeTime: boolean,
): string {
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const datePart = dateFmt.format(utcDate)
  if (!includeTime) return datePart
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  })
  const timeParts = timeFmt.formatToParts(utcDate)
  const hour = timeParts.find((p) => p.type === 'hour')?.value ?? ''
  const minute = timeParts.find((p) => p.type === 'minute')?.value ?? ''
  const dayPeriod = timeParts.find((p) => p.type === 'dayPeriod')?.value ?? ''
  const tzAbbr = timeParts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  return `${datePart} at ${hour}:${minute} ${dayPeriod}${tzAbbr ? ' ' + tzAbbr : ''}`
}

/**
 * Convert a leadTimeMinutes value to a short human phrase.
 * 60 → "1 hour", 1440 → "24 hours", 2880 → "2 days", 10080 → "1 week".
 */
export function humanizeLeadTime(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  if (minutes < 1440) {
    const h = Math.round(minutes / 60)
    return `${h} hour${h === 1 ? '' : 's'}`
  }
  if (minutes < 10080) {
    const d = Math.round(minutes / 1440)
    return `${d} day${d === 1 ? '' : 's'}`
  }
  const w = Math.round(minutes / 10080)
  return `${w} week${w === 1 ? '' : 's'}`
}
