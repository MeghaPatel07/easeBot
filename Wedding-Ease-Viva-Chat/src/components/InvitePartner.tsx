import React, { useState, useEffect } from 'react'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  UserPlus,
  Users,
  Mail,
  Copy,
  Check,
  X,
  Clock,
  CheckCircle2,
  Link,
} from 'lucide-react'

interface Collaborator {
  email: string
  name: string | null
  status: 'pending' | 'accepted'
  invitedAt: Date
}

interface CollaborationSettings {
  sharedWith: Collaborator[]
  updatedAt: any
}

interface InvitePartnerProps {
  userId: string
  userEmail: string
  userName: string
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function InvitePartner({ userId, userEmail, userName }: InvitePartnerProps) {
  const [email, setEmail] = useState('')
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)

  const collabDocRef = doc(db, 'users', userId, 'settings', 'collaboration')

  useEffect(() => {
    const unsubscribe = onSnapshot(collabDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as CollaborationSettings
        const parsed = (data.sharedWith || []).map((c: any) => ({
          ...c,
          invitedAt:
            c.invitedAt instanceof Timestamp
              ? c.invitedAt.toDate()
              : new Date(c.invitedAt),
        }))
        setCollaborators(parsed)
      } else {
        setCollaborators([])
      }
    })
    return () => unsubscribe()
  }, [userId])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setCopied(false)
    setLastInviteLink(null)

    const trimmed = email.trim().toLowerCase()

    if (!trimmed) {
      setError('Please enter an email address.')
      return
    }

    if (!isValidEmail(trimmed)) {
      setError('Please enter a valid email address.')
      return
    }

    if (trimmed === userEmail.toLowerCase()) {
      setError("You're already part of this plan.")
      return
    }

    if (collaborators.some((c) => c.email.toLowerCase() === trimmed)) {
      setError('This person has already been invited.')
      return
    }

    setLoading(true)

    try {
      const newCollaborator: Collaborator = {
        email: trimmed,
        name: null,
        status: 'pending',
        invitedAt: new Date(),
      }

      const snap = await getDoc(collabDocRef)

      if (snap.exists()) {
        const existing = snap.data() as CollaborationSettings
        await updateDoc(collabDocRef, {
          sharedWith: [...(existing.sharedWith || []), newCollaborator],
          updatedAt: serverTimestamp(),
        })
      } else {
        await setDoc(collabDocRef, {
          sharedWith: [newCollaborator],
          updatedAt: serverTimestamp(),
        })
      }

      const inviteLink = `${window.location.origin}/invite?from=${userId}`
      setLastInviteLink(inviteLink)
      setSuccess(`Invite sent to ${trimmed}. They'll receive an email to join your plan.`)
      setEmail('')
    } catch (err: any) {
      setError(err.message || 'Failed to send invite. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = async () => {
    if (!lastInviteLink) return
    try {
      await navigator.clipboard.writeText(lastInviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Failed to copy link.')
    }
  }

  const handleRemove = async (emailToRemove: string) => {
    try {
      const updated = collaborators.filter(
        (c) => c.email.toLowerCase() !== emailToRemove.toLowerCase()
      )
      await updateDoc(collabDocRef, {
        sharedWith: updated,
        updatedAt: serverTimestamp(),
      })
    } catch (err: any) {
      setError(err.message || 'Failed to remove collaborator.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Share info section */}
      <div className="rounded-2xl bg-white/70 border border-border p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Link className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-headline text-base font-semibold text-foreground">
              Collaborative Planning
            </h3>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              Plan together in real-time. Invite your partner or planner to see all your checklists, budgets, and timelines. Changes sync instantly.
            </p>
          </div>
        </div>
      </div>

      {/* Invite form */}
      <div className="rounded-2xl bg-white/70 border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="h-4.5 w-4.5 text-primary" />
          <h4 className="font-headline text-sm font-semibold text-foreground">
            Send an Invite
          </h4>
        </div>

        <form onSubmit={handleInvite} className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
              <input
                type="email"
                placeholder="partner@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (error) setError(null)
                }}
                className="w-full rounded-xl border border-border bg-white py-2.5 pl-12 pr-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {loading ? 'Sending...' : 'Send Invite'}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-500 flex items-center gap-1.5">
              <X className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </p>
          )}

          {success && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 space-y-2">
              <p className="text-sm text-green-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                {success}
              </p>
              {lastInviteLink && (
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white rounded-lg border border-green-200 px-2.5 py-1.5 text-green-800 truncate">
                    {lastInviteLink}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="rounded-lg bg-white border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 transition-colors flex items-center gap-1.5"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Active collaborators list / Empty state */}
      <div className="rounded-2xl bg-white/70 border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4.5 w-4.5 text-primary" />
          <h4 className="font-headline text-sm font-semibold text-foreground">
            Collaborators
          </h4>
          {collaborators.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground bg-primary/10 rounded-full px-2 py-0.5">
              {collaborators.length}
            </span>
          )}
        </div>

        {collaborators.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-2xl bg-primary/10 p-4 mb-4">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h5 className="font-headline text-base font-semibold text-foreground mb-1">
              Plan together
            </h5>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Invite your partner or a wedding planner to collaborate in real
              time. Share checklists, budgets, and timelines seamlessly.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {collaborators.map((collab) => (
              <li
                key={collab.email}
                className="flex items-center gap-3 rounded-xl border border-border bg-white p-3 group"
              >
                <div className="rounded-lg bg-primary/10 p-2">
                  <Mail className="h-4 w-4 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {collab.name || collab.email}
                  </p>
                  {collab.name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {collab.email}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Invited {formatDate(collab.invitedAt)}
                  </p>
                </div>

                {collab.status === 'pending' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    <Clock className="h-3 w-3" />
                    Pending
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Active
                  </span>
                )}

                <button
                  onClick={() => handleRemove(collab.email)}
                  className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove collaborator"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
