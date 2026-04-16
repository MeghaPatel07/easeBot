// NotificationsTab — Sprint 2 (Yuki). Settings & Profile redesign, PRD §5.
//
// Three cards: Email notifications, WhatsApp notifications, In-app
// notifications (placeholder). All boolean toggles persist through
// useAccount.updatePreferences with optimistic update + rollback.

import React, { useCallback, useEffect, useState } from 'react'
import { useAccount } from '@/hooks/useAccount'
import { useToast } from '@/hooks/use-toast'
import type { UserPreferences } from '@/types'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { AlertTriangle } from 'lucide-react'
import TabShell from './_TabShell'

type NotifKey = 'emailReminders' | 'whatsappReminders' | 'productUpdates' | 'tips'

type NotificationState = {
  emailReminders: boolean
  whatsappReminders: boolean
  productUpdates: boolean
  tips: boolean
}

const DEFAULTS: NotificationState = {
  emailReminders: true,
  whatsappReminders: false,
  productUpdates: true,
  tips: true,
}

interface RowProps {
  id: string
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (next: boolean) => void
}

function SwitchRow({ id, label, description, checked, disabled, onCheckedChange }: RowProps) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-3">
      <div className="flex-1">
        <Label htmlFor={id} className="text-sm font-medium text-white/90">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-white/90">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
    </div>
  )
}

export function NotificationsTab() {
  const { profile, updatePreferences } = useAccount()
  const { toast } = useToast()

  const profileNotifs = profile?.preferences?.notifications

  const [state, setState] = useState<NotificationState>({
    emailReminders: profileNotifs?.emailReminders ?? DEFAULTS.emailReminders,
    whatsappReminders: profileNotifs?.whatsappReminders ?? DEFAULTS.whatsappReminders,
    productUpdates: profileNotifs?.productUpdates ?? DEFAULTS.productUpdates,
    tips: profileNotifs?.tips ?? DEFAULTS.tips,
  })

  useEffect(() => {
    if (!profileNotifs) return
    setState({
      emailReminders: profileNotifs.emailReminders ?? DEFAULTS.emailReminders,
      whatsappReminders: profileNotifs.whatsappReminders ?? DEFAULTS.whatsappReminders,
      productUpdates: profileNotifs.productUpdates ?? DEFAULTS.productUpdates,
      tips: profileNotifs.tips ?? DEFAULTS.tips,
    })
  }, [profileNotifs])

  const hasWhatsAppNumber = Boolean(profile?.phone)

  const persist = useCallback(
    async (next: NotificationState) => {
      const merged: UserPreferences = {
        ...(profile?.preferences ?? {}),
        notifications: {
          ...(profile?.preferences?.notifications ?? {}),
          ...next,
        },
      }
      await updatePreferences(merged)
    },
    [profile?.preferences, updatePreferences],
  )

  const onToggle = useCallback(
    (key: NotifKey) => async (checked: boolean) => {
      const previous = state
      const next = { ...state, [key]: checked }
      setState(next)
      try {
        await persist(next)
      } catch (err) {
        setState(previous)
        toast({
          title: 'Could not save preference',
          description: 'Reverted to your previous setting.',
          variant: 'destructive',
        })
      }
    },
    [state, persist, toast],
  )

  return (
    <TabShell
      title="Notifications"
      description="Decide how Easebot reaches out about reminders, tips, and product news."
    >
      {/* Email notifications */}
      <Card className="p-6">
        <div className="mb-2">
          <h3 className="text-base font-semibold">Email notifications</h3>
          <p className="mt-1 text-xs text-white/90">
            Sent to {profile?.email ?? 'your account email'}.
          </p>
        </div>
        <div className="divide-y divide-white/[0.06]">
          <SwitchRow
            id="email-reminders"
            label="Wedding reminders"
            description="RSVPs, vendor follow-ups, task deadlines."
            checked={state.emailReminders}
            onCheckedChange={onToggle('emailReminders')}
          />
          <SwitchRow
            id="email-tips"
            label="Planning tips"
            description="Curated weekly suggestions tailored to your wedding."
            checked={state.tips}
            onCheckedChange={onToggle('tips')}
          />
          <SwitchRow
            id="email-product"
            label="Product updates"
            description="New features, AI mode launches, important announcements."
            checked={state.productUpdates}
            onCheckedChange={onToggle('productUpdates')}
          />
        </div>
      </Card>

      {/* WhatsApp notifications
      <Card className="p-6">
        <div className="mb-2">
          <h3 className="text-base font-semibold">WhatsApp notifications</h3>
          <p className="mt-1 text-xs text-white/90">
            Get the most urgent reminders pushed to your phone.
          </p>
        </div>
        {!hasWhatsAppNumber && (
          <div
            role="status"
            className="mb-2 flex items-start gap-2 rounded-xl bg-white/[0.04] p-3 text-xs text-white/90"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Add your WhatsApp number in Account to enable.</p>
          </div>
        )}
        <SwitchRow
          id="whatsapp-reminders"
          label="WhatsApp reminders"
          description="High-priority alerts about upcoming wedding tasks."
          checked={state.whatsappReminders && hasWhatsAppNumber}
          disabled={!hasWhatsAppNumber}
          onCheckedChange={onToggle('whatsappReminders')}
        />
      </Card> */}

    </TabShell>
  )
}

export default NotificationsTab
