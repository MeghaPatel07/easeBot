import { Request, Response } from 'express'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { createCalendarEvent, CalendarEvent } from '../services/calendarService'

export async function handleAddCalendarEvent(req: Request, res: Response): Promise<void> {
  const { googleAccessToken, event } = req.body as {
    googleAccessToken?: string
    event?: CalendarEvent
  }

  if (!googleAccessToken) {
    res.status(400).json({ error: 'googleAccessToken is required' })
    return
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
    // Create in Google Calendar
    const result = await createCalendarEvent(googleAccessToken, event)

    // Save to Firestore under users/{uid}/calendarEvents
    await addDoc(collection(db, 'users', uid, 'calendarEvents'), {
      title: event.title,
      date: event.date,
      time: event.time ?? null,
      description: event.description ?? null,
      reminderMinutes: event.reminderMinutes ?? null,
      googleEventId: result.eventId,
      htmlLink: result.htmlLink,
      createdAt: serverTimestamp(),
    })

    res.status(200).json(result)
  } catch (err: any) {
    console.error('[calendarController]', err)
    res.status(500).json({ error: err.message ?? 'Failed to create calendar event' })
  }
}
