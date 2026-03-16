/**
 * Google Calendar API service.
 * Uses the user's Google OAuth access token obtained during sign-in.
 */

export interface CalendarEvent {
  title: string
  date: string        // ISO date: "2025-03-15"
  time?: string       // "14:00" (optional — all-day if omitted)
  description?: string
  reminderMinutes?: number  // default 60
}

export async function createCalendarEvent(
  googleAccessToken: string,
  event: CalendarEvent
): Promise<{ eventId: string; htmlLink: string }> {
  const startDateTime = event.time
    ? `${event.date}T${event.time}:00`
    : event.date

  const isAllDay = !event.time

  const body = isAllDay
    ? {
        summary: event.title,
        description: event.description ?? '',
        start: { date: event.date },
        end: { date: event.date },
        reminders: {
          useDefault: false,
          overrides: [{ method: 'email', minutes: event.reminderMinutes ?? 1440 }],
        },
      }
    : {
        summary: event.title,
        description: event.description ?? '',
        start: { dateTime: startDateTime, timeZone: 'Asia/Kolkata' },
        end: { dateTime: startDateTime, timeZone: 'Asia/Kolkata' },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: event.reminderMinutes ?? 60 },
            { method: 'email', minutes: event.reminderMinutes ?? 60 },
          ],
        },
      }

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google Calendar API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return { eventId: data.id, htmlLink: data.htmlLink }
}
