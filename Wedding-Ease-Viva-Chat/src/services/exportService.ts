// ─────────────────────────────────────────────────────────────────────────────
// Export Service — PRICING_PRD §4 tier-gated exports.
// Free: checklist PDF only. Pro: PDF + CSV. ProMax: PDF + CSV + JSON + links.
// All exports run client-side (no backend endpoint needed for v1).
// ─────────────────────────────────────────────────────────────────────────────

import { resolveTier, getLimits, tierLabel, upgradeTier, type PlanTier } from '@/config/tierConfig'

export type ExportFormat = 'pdf' | 'csv' | 'json'

export interface ExportGateResult {
  allowed: boolean
  format: ExportFormat
  tier: PlanTier
  message?: string
}

/**
 * Check whether a user can export in the given format.
 * Returns allowed=false with a descriptive message when blocked.
 */
export function checkExportAccess(
  profile: { plan?: string; tierMirror?: string; isPremium?: boolean } | null,
  format: ExportFormat,
): ExportGateResult {
  const tier = resolveTier(profile)
  const limits = getLimits(tier)

  if (limits.exportFormats.includes(format)) {
    return { allowed: true, format, tier }
  }

  const next = upgradeTier(tier)
  const nextLabel = next ? tierLabel(next) : 'a higher plan'

  return {
    allowed: false,
    format,
    tier,
    message: `${format.toUpperCase()} export is not available on the ${tierLabel(tier)} plan. Upgrade to ${nextLabel} to unlock this format.`,
  }
}

/**
 * Check whether shareable read-only links are available.
 */
export function checkShareableLinkAccess(
  profile: { plan?: string; tierMirror?: string; isPremium?: boolean } | null,
): { allowed: boolean; message?: string } {
  const tier = resolveTier(profile)
  const limits = getLimits(tier)

  if (limits.shareableLinks) {
    return { allowed: true }
  }

  return {
    allowed: false,
    message: `Shareable links are a Pro Max feature. Upgrade to create read-only links for your chats and notes.`,
  }
}

// ── Export generators ───────────────────────────────────────────────────────

export interface ExportableItem {
  title: string
  items?: { text: string; completed?: boolean }[]
  content?: string
  date?: string
}

/** Generate a simple text-based "PDF" content (actual PDF lib can be added later). */
export function generatePdfContent(data: ExportableItem[]): string {
  const lines: string[] = []
  for (const item of data) {
    lines.push(`=== ${item.title} ===`)
    if (item.date) lines.push(`Date: ${item.date}`)
    if (item.items) {
      for (const sub of item.items) {
        lines.push(`  ${sub.completed ? '[x]' : '[ ]'} ${sub.text}`)
      }
    }
    if (item.content) lines.push(item.content)
    lines.push('')
  }
  return lines.join('\n')
}

/** Generate CSV content. */
export function generateCsvContent(data: ExportableItem[]): string {
  const rows: string[][] = [['Title', 'Item', 'Completed', 'Date']]
  for (const item of data) {
    if (item.items) {
      for (const sub of item.items) {
        rows.push([item.title, sub.text, sub.completed ? 'Yes' : 'No', item.date ?? ''])
      }
    } else {
      rows.push([item.title, item.content ?? '', '', item.date ?? ''])
    }
  }
  return rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
}

/** Generate JSON content. */
export function generateJsonContent(data: ExportableItem[]): string {
  return JSON.stringify(data, null, 2)
}

/** Trigger a file download in the browser. */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Export data in the specified format with tier gate check. */
export function exportData(
  profile: { plan?: string; tierMirror?: string; isPremium?: boolean } | null,
  format: ExportFormat,
  data: ExportableItem[],
  filenameBase: string,
): ExportGateResult {
  const gate = checkExportAccess(profile, format)
  if (!gate.allowed) return gate

  let content: string
  let mimeType: string
  let ext: string

  switch (format) {
    case 'pdf':
      content = generatePdfContent(data)
      mimeType = 'text/plain'
      ext = 'txt' // actual PDF generation would use jsPDF
      break
    case 'csv':
      content = generateCsvContent(data)
      mimeType = 'text/csv'
      ext = 'csv'
      break
    case 'json':
      content = generateJsonContent(data)
      mimeType = 'application/json'
      ext = 'json'
      break
  }

  downloadFile(content, `${filenameBase}.${ext}`, mimeType)
  return gate
}
