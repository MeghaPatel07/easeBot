import { Request, Response } from 'express'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { createCalendarEvent, CalendarEvent } from '../services/calendarService'

export async function handleAddCalendarEvent(req: Request, res: Response): Promise<void> {
  const { googleAccessToken, event } = req.body as {
    googleAccessToken?: string
    event?: CalendarEvent
  }

  if (!event?.title || !event?.date) {
    res.status(400).json({ error: 'event.title and event.date are required' })
    return
  }

  const uid = req.user?.uid
  if (!uid) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  try {
    let eventId = `local-${Date.now()}`
    let htmlLink = ''

    // Push to Google Calendar only when the OAuth token is available
    if (googleAccessToken) {
      try {
        const gcalResult = await createCalendarEvent(googleAccessToken, event)
        eventId = gcalResult.eventId
        htmlLink = gcalResult.htmlLink
      } catch (gcalErr: any) {
        console.warn('[calendarController] Google Calendar sync failed (token may be expired):', gcalErr.message)
        // Continue — we still save to Firestore below
      }
    }

    // Always save to Firestore under users/{uid}/calendarEvents
    await addDoc(collection(db, 'users', uid, 'calendarEvents'), {
      title: event.title,
      date: event.date,
      time: event.time ?? null,
      description: event.description ?? null,
      reminderMinutes: event.reminderMinutes ?? null,
      googleEventId: eventId,
      htmlLink,
      createdAt: serverTimestamp(),
    })

    res.status(200).json({ eventId, htmlLink })
  } catch (err: any) {
    console.error('[calendarController]', err)
    res.status(500).json({ error: err.message ?? 'Failed to create calendar event' })
  }
}
