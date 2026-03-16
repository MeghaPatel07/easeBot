import { Request, Response, NextFunction } from 'express'

declare global {
  namespace Express {
    interface Request {
      user?: { uid: string; email?: string; [key: string]: any }
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    // If no token is provided, proceed as guest
    next()
    return
  }
  const token = authHeader.split('Bearer ')[1]
  try {
    const apiKey = process.env.FIREBASE_API_KEY
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      }
    )
    if (!response.ok) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    const data = await response.json() as { users?: Array<{ localId: string; email?: string }> }
    const firebaseUser = data.users?.[0]
    if (!firebaseUser) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    req.user = { uid: firebaseUser.localId, email: firebaseUser.email }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
