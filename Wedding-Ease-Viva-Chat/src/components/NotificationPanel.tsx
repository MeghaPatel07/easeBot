import { useState, useEffect, useCallback, useMemo } from 'react'
import { Bell, AlertTriangle, Info, Check, CheckCheck, X, Trash2, Clock } from 'lucide-react'
import {
  subscribeToNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  generateOverdueNotifications,
  type AppNotification,
} from '@/services/notificationService'

// ── Props ────────────────────────────────────────────────────────────────────

interface NotificationPanelProps {
  userId: string
  checklists: Array<{
    id: string
    title: string
    items: Array<{
      id: string
      text: string
      completed: boolean
      dueDate: string | null
    }>
  }>
}

// ── Time-ago helper ──────────────────────────────────────────────────────────

function timeAgo(createdAt: any): string {
  if (!createdAt) return 'just now'
  const date =
    typeof createdAt.toDate === 'function'
      ? createdAt.toDate()
      : new Date(createdAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay} days ago`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) === 1 ? '' : 's'} ago`
  return `${Math.floor(diffDay / 30)} month${Math.floor(diffDay / 30) === 1 ? '' : 's'} ago`
}

// ── Group helper ─────────────────────────────────────────────────────────────

type GroupLabel = 'Today' | 'Earlier this week' | 'Older'

function getGroupLabel(createdAt: any): GroupLabel {
  if (!createdAt) return 'Today'
  const date =
    typeof createdAt.toDate === 'function'
      ? createdAt.toDate()
      : new Date(createdAt)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayOfWeek = now.getDay() // 0=Sun
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfToday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))

  if (date >= startOfToday) return 'Today'
  if (date >= startOfWeek) return 'Earlier this week'
  return 'Older'
}

function groupNotifications(
  notifs: AppNotification[]
): Array<{ label: GroupLabel; items: AppNotification[] }> {
  const groups: Record<GroupLabel, AppNotification[]> = {
    Today: [],
    'Earlier this week': [],
    Older: [],
  }
  notifs.forEach((n) => {
    groups[getGroupLabel(n.createdAt)].push(n)
  })
  const order: GroupLabel[] = ['Today', 'Earlier this week', 'Older']
  return order
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, items: groups[label] }))
}

// ── Type icon helper ─────────────────────────────────────────────────────────

function TypeIcon({ type }: { type: AppNotification['type'] }) {
  switch (type) {
    case 'overdue':
      return <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
    case 'reminder':
      return <Bell className="h-5 w-5 text-amber-500 shrink-0" />
    case 'info':
      return <Info className="h-5 w-5 text-primary shrink-0" />
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function NotificationPanel({ userId, checklists }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  // Subscribe to notifications
  useEffect(() => {
    const unsub = subscribeToNotifications(userId, setNotifications)
    return () => unsub()
  }, [userId])

  // Generate overdue notifications when checklists change
  useEffect(() => {
    if (checklists.length > 0) {
      generateOverdueNotifications(userId, checklists).catch((err) =>
        console.error('[NotificationPanel] overdue generation failed', err)
      )
    }
  }, [userId, checklists])

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  )

  const grouped = useMemo(() => groupNotifications(notifications), [notifications])

  const handleMarkAsRead = useCallback(
    async (notifId: string) => {
      try {
        await markAsRead(userId, notifId)
      } catch (err) {
        console.error('[NotificationPanel] markAsRead failed', err)
      }
    },
    [userId]
  )

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await markAllAsRead(userId, notifications)
    } catch (err) {
      console.error('[NotificationPanel] markAllAsRead failed', err)
    }
  }, [userId, notifications])

  const handleDelete = useCallback(
    async (notifId: string) => {
      setDeletingIds((prev) => new Set(prev).add(notifId))
      // Small delay for transition
      setTimeout(async () => {
        try {
          await deleteNotification(userId, notifId)
        } catch (err) {
          console.error('[NotificationPanel] delete failed', err)
        }
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(notifId)
          return next
        })
      }, 200)
    },
    [userId]
  )

  // ── Empty state ──────────────────────────────────────────────────────────

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="rounded-full bg-white/[0.06] p-4 mb-4">
          <Bell className="h-8 w-8 text-white/40" />
        </div>
        <h3 className="text-lg font-semibold text-white/70 mb-1">No notifications</h3>
        <p className="text-sm text-white/50 max-w-xs">
          You'll see reminders for upcoming deadlines here
        </p>
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-white text-xs font-medium">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {grouped.map((group) => (
          <div key={group.label}>
            {/* Group header */}
            <div className="sticky top-0 z-10 px-4 py-2 bg-white/[0.04] backdrop-blur-sm">
              <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
                {group.label}
              </span>
            </div>

            {/* Notification items */}
            {group.items.map((notif) => {
              const isDeleting = deletingIds.has(notif.id)
              return (
                <div
                  key={notif.id}
                  onClick={() => {
                    if (!notif.read) handleMarkAsRead(notif.id)
                  }}
                  className={`
                    group relative flex items-start gap-3 px-4 py-3 cursor-pointer
                    border-b border-white/[0.06] transition-all duration-200
                    ${isDeleting ? 'opacity-0 max-h-0 py-0 overflow-hidden' : 'opacity-100 max-h-40'}
                    ${notif.read ? 'bg-white/[0.06] hover:bg-white/[0.06]' : 'bg-blue-500/10 hover:bg-blue-500/15'}
                  `}
                >
                  {/* Unread dot */}
                  {!notif.read && (
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" />
                  )}

                  {/* Type icon */}
                  <div className="mt-0.5">
                    <TypeIcon type={notif.type} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${notif.read ? 'text-white/70' : 'text-white/90 font-semibold'}`}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{notif.body}</p>
                    <div className="flex items-center gap-1 mt-1 text-white/40">
                      <Clock className="h-3 w-3" />
                      <span className="text-label">{timeAgo(notif.createdAt)}</span>
                    </div>
                  </div>

                  {/* Delete button (visible on hover) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(notif.id)
                    }}
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-2 rounded hover:bg-red-50 text-white/40 hover:text-red-500 shrink-0 mt-0.5"
                    aria-label="Delete notification"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
