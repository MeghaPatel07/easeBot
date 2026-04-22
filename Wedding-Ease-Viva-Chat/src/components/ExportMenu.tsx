// ─────────────────────────────────────────────────────────────────────────────
// ExportMenu — tier-gated export items designed to drop into an existing
// Radix DropdownMenu. Renders three items (PDF / CSV / JSON); formats not
// allowed by the user's plan are shown with a Lock icon and route to /pricing.
// Honors PRICING_PRD §4: Free → pdf; Pro → pdf+csv; ProMax → pdf+csv+json.
// ─────────────────────────────────────────────────────────────────────────────

import { useNavigate } from 'react-router-dom'
import { FileText, FileSpreadsheet, Lock, Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  checkExportAccess,
  exportData,
  type ExportFormat,
  type ExportableItem,
} from '@/services/exportService'
import type { UserProfile } from '@/types'
import { track } from '@/lib/analytics'

export type ExportSource = 'checklist' | 'note' | 'timeline' | 'chat'

interface ExportMenuProps {
  profile: UserProfile | null
  data: ExportableItem[]
  filenameBase: string
  source: ExportSource
  /** Optional id of the artefact being exported (for analytics correlation). */
  sourceId?: string
  /** Render a section label above the items. Defaults to true. */
  showLabel?: boolean
}

const FORMATS: Array<{ format: ExportFormat; label: string; Icon: typeof FileText }> = [
  { format: 'pdf', label: 'PDF', Icon: FileText },
  { format: 'csv', label: 'CSV (Excel)', Icon: FileSpreadsheet },
]

export default function ExportMenu({
  profile,
  data,
  filenameBase,
  source,
  sourceId,
  showLabel = true,
}: ExportMenuProps) {
  const navigate = useNavigate()

  const handleExport = (format: ExportFormat) => {
    const gate = checkExportAccess(profile, format)
    if (!gate.allowed) {
      track('data_export_requested', {
        source,
        source_id: sourceId,
        format,
        allowed: false,
        tier: gate.tier,
      })
      toast.error(gate.message ?? 'Upgrade to unlock this export.', {
        action: {
          label: 'Upgrade',
          onClick: () => navigate('/pricing'),
        },
      })
      return
    }

    try {
      exportData(profile, format, data, filenameBase)
      track('data_export_requested', {
        source,
        source_id: sourceId,
        format,
        allowed: true,
        tier: gate.tier,
        item_count: data.length,
      })
      toast.success(`${format.toUpperCase()} download started`)
    } catch (err) {
      console.error('Export failed:', err)
      toast.error('Export failed. Please try again.')
    }
  }

  return (
    <>
      {showLabel && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-foreground/40 px-2 py-1 flex items-center gap-1.5">
            <Download className="h-3 w-3" /> Download as
          </DropdownMenuLabel>
        </>
      )}
      {FORMATS.map(({ format, label, Icon }) => {
        const gate = checkExportAccess(profile, format)
        const locked = !gate.allowed
        return (
          <DropdownMenuItem
            key={format}
            onSelect={(e) => {
              e.preventDefault()
              handleExport(format)
            }}
            className={`text-xs gap-2 py-2 cursor-pointer ${
              locked ? 'text-foreground/40 focus:text-foreground/60' : ''
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="flex-1">{label}</span>
            {locked && <Lock className="h-3 w-3 text-foreground/40" aria-label="Upgrade required" />}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}
