// DataPrivacyTab — Sprint 2 (Yuki). Settings & Profile redesign, PRD §5.
//
// Five cards: Data training opt-out, Export your data, Clear chat history,
// Cookie preferences (placeholder), Your rights (GDPR/DPDP copy).
// All 501 endpoints are degraded to polite toasts.

import React, { useCallback, useEffect, useState } from 'react'
import { useAccount } from '@/hooks/useAccount'
import { useToast } from '@/hooks/use-toast'
import { exportAccountData, clearChatHistory } from '@/services/accountService'
import type { UserPreferences } from '@/types'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Download, Trash2, Cookie, ShieldCheck } from 'lucide-react'
import TabShell from './_TabShell'

export function DataPrivacyTab() {
  const { profile, updatePreferences } = useAccount()
  const { toast } = useToast()

  const [optOut, setOptOut] = useState<boolean>(
    profile?.preferences?.dataTrainingOptOut ?? false,
  )

  useEffect(() => {
    setOptOut(profile?.preferences?.dataTrainingOptOut ?? false)
  }, [profile?.preferences?.dataTrainingOptOut])

  const onOptOutChange = useCallback(
    async (checked: boolean) => {
      const previous = optOut
      setOptOut(checked)
      const merged: UserPreferences = {
        ...(profile?.preferences ?? {}),
        dataTrainingOptOut: checked,
      }
      try {
        await updatePreferences(merged)
      } catch (err) {
        setOptOut(previous)
        toast({
          title: 'Could not save preference',
          description: 'Reverted to your previous setting.',
          variant: 'destructive',
        })
      }
    },
    [optOut, profile?.preferences, updatePreferences, toast],
  )

  const [exporting, setExporting] = useState(false)
  const [clearing, setClearing] = useState(false)

  const onExport = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      const blob = await exportAccountData()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `weddingease-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({
        title: 'Download started',
        description: 'Your data export is being saved to your device.',
      })
    } catch (err) {
      toast({
        title: 'Could not export',
        description: (err as Error)?.message ?? 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setExporting(false)
    }
  }, [exporting, toast])

  const onClearHistory = useCallback(async () => {
    if (clearing) return
    setClearing(true)
    try {
      const result = await clearChatHistory()
      toast({
        title: 'Chat history cleared',
        description: `Deleted ${result.deletedThreads} thread${result.deletedThreads === 1 ? '' : 's'}.`,
      })
    } catch (err) {
      toast({
        title: 'Could not clear history',
        description: (err as Error)?.message ?? 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setClearing(false)
    }
  }, [clearing, toast])

  return (
    <TabShell
      title="Data & Privacy"
      description="Control how WeddingEase stores, uses, and shares your information."
    >
      {/* Data training */}
      {/* <Card className="p-6">
        <div className="mb-2">
          <h3 className="text-base font-semibold">Improve the model for everyone</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            By default, anonymized snippets of your chats may be used to make Easebot
            better. Opt out at any time.
          </p>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-4 py-3">
          <Label
            htmlFor="data-training-opt-out"
            className="text-sm font-medium text-foreground"
          >
            Don&rsquo;t use my chats for training
          </Label>
          <Switch
            id="data-training-opt-out"
            checked={optOut}
            onCheckedChange={onOptOutChange}
            aria-label="Don't use my chats for training"
            className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>
      </Card> */}

      {/* Export data */}
      {/* <Card className="p-6">
        <div className="mb-3">
          <h3 className="text-base font-semibold">Export your data</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Download a copy of your profile, chats, notes, and reminders in JSON.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onExport}
          disabled={exporting}
          aria-label="Download all my data"
          className="min-h-11 min-w-11 border-border bg-background text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Download aria-hidden="true" className="mr-2 h-4 w-4" />
          {exporting ? 'Preparing…' : 'Download all my data'}
        </Button>
      </Card> */}

      {/* Clear chat history */}
      <Card className="p-6">
        <div className="mb-3">
          <h3 className="text-base font-semibold">Clear chat history</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Permanently delete every chat thread on this account. This cannot be undone.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              disabled={clearing}
              aria-label="Clear chat history"
              className="min-h-11 min-w-11 bg-destructive text-destructive-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
              {clearing ? 'Clearing…' : 'Clear chat history'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-popover text-popover-foreground border-border">
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all chat history?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                Every chat thread, message, and AI response on this account will be
                permanently deleted. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onClearHistory}
                className="min-h-11 bg-destructive text-destructive-foreground hover:opacity-90"
              >
                Delete everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>

      {/* Cookie preferences */}
      <Card className="p-6">
        <div className="mb-2 flex items-start gap-3">
          <Cookie aria-hidden="true" className="mt-0.5 h-4 w-4 text-foreground" />
          <div>
            <h3 className="text-base font-semibold">Cookie preferences</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              WeddingEase only uses essential cookies for authentication and session
              continuity. Tracking and analytics cookies are managed in your browser
              settings.
            </p>
          </div>
        </div>
      </Card>

      {/* Your rights */}
      <Card className="p-6">
        <div className="mb-2 flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 text-foreground" />
          <div>
            <h3 className="text-base font-semibold">Your rights</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Under the EU GDPR and India&rsquo;s DPDP Act you may request access,
              correction, or deletion of your personal data at any time. We respond
              within 30 days.
            </p>
            <a
              href="/privacy"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Read our Privacy Policy
            </a>
          </div>
        </div>
      </Card>
    </TabShell>
  )
}

export default DataPrivacyTab
