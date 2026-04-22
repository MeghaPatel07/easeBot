// ─────────────────────────────────────────────────────────────────────────────
// Export Service — PRICING_PRD §4 tier-gated exports.
// Free: checklist PDF only. Pro: PDF + CSV. ProMax: PDF + CSV + share links.
// All exports run client-side (no backend endpoint needed for v1).
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { resolveTier, getLimits, tierLabel, upgradeTier, type PlanTier } from '@/config/tierConfig'

export type ExportFormat = 'pdf' | 'csv'

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

/** Render a real PDF document via jsPDF and return it as a Blob. */
export function generatePdfBlob(data: ExportableItem[]): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const marginX = 48
  const marginTop = 56
  const marginBottom = 56
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - marginX * 2
  const lineHeight = 16
  let y = marginTop

  const advance = (delta: number) => {
    if (y + delta > pageHeight - marginBottom) {
      doc.addPage()
      y = marginTop
    }
    y += delta
  }

  const writeLine = (text: string, size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    const wrapped = doc.splitTextToSize(text || ' ', contentWidth) as string[]
    for (const line of wrapped) {
      if (y + lineHeight > pageHeight - marginBottom) {
        doc.addPage()
        y = marginTop
      }
      doc.text(line, marginX, y)
      y += lineHeight
    }
  }

  for (let i = 0; i < data.length; i++) {
    const item = data[i]
    if (i > 0) advance(8)

    writeLine(item.title || 'Untitled', 16, 'bold')

    if (item.date) {
      writeLine(item.date, 10, 'normal')
    }

    advance(4)

    if (item.items && item.items.length > 0) {
      for (const sub of item.items) {
        const marker = sub.completed ? '[x]' : '[ ]'
        writeLine(`${marker} ${sub.text}`, 11, 'normal')
      }
    }

    if (item.content) {
      advance(4)
      writeLine(item.content, 11, 'normal')
    }
  }

  return doc.output('blob') as Blob
}

/**
 * Rasterise a rendered HTML element to a multi-page PDF.
 * Preserves fonts, colors, images, and layout by painting the node with
 * html2canvas and tiling the resulting bitmap across A4 pages.
 */
export async function generateHtmlPdfBlob(
  element: HTMLElement,
  title?: string,
): Promise<Blob> {
  // Wait a tick so any images inside the node have a chance to decode.
  const imgs = Array.from(element.querySelectorAll('img'))
  await Promise.all(
    imgs.map(img =>
      img.complete && img.naturalHeight > 0
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )

  const bodyBg = getComputedStyle(document.body).backgroundColor || '#ffffff'
  const canvas = await html2canvas(element, {
    backgroundColor: bodyBg,
    scale: Math.min(2, window.devicePixelRatio || 1.5),
    useCORS: true,
    logging: false,
    // Honor element's own width; height will derive from layout.
    windowWidth: element.scrollWidth,
  })

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 32
  const contentWidth = pageWidth - margin * 2
  const imgWidth = contentWidth
  const pxPerPt = canvas.width / imgWidth
  const contentHeightPx = Math.floor((pageHeight - margin * 2) * pxPerPt)

  if (title) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(title, margin, margin + 12)
  }
  const firstPageOffset = title ? margin + 28 : margin

  // Slice the source canvas vertically across pages.
  let y = 0
  let firstPage = true
  while (y < canvas.height) {
    const sliceHeight = Math.min(contentHeightPx, canvas.height - y)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeight
    const ctx = pageCanvas.getContext('2d')
    if (!ctx) break
    ctx.fillStyle = bodyBg
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

    const imgData = pageCanvas.toDataURL('image/png')
    const imgHeightPt = sliceHeight / pxPerPt

    if (!firstPage) doc.addPage()
    const topOffset = firstPage ? firstPageOffset : margin
    doc.addImage(imgData, 'PNG', margin, topOffset, imgWidth, imgHeightPt, undefined, 'FAST')

    firstPage = false
    y += sliceHeight
  }

  return doc.output('blob') as Blob
}

/** Generate CSV content. Title sits in a section header row rather than
 *  repeating down column A for every item. */
export function generateCsvContent(data: ExportableItem[]): string {
  const rows: string[][] = []
  data.forEach((item, idx) => {
    if (idx > 0) rows.push([''])
    rows.push([item.title || 'Untitled'])
    rows.push(['Item', 'Completed', 'Date'])
    if (item.items && item.items.length > 0) {
      for (const sub of item.items) {
        rows.push([sub.text, sub.completed ? 'Yes' : 'No', item.date ?? ''])
      }
    } else {
      rows.push([item.content ?? '', '', item.date ?? ''])
    }
  })
  return rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
}

/** Trigger a file download in the browser. Accepts Blob or string payloads. */
export function downloadFile(content: Blob | string, filename: string, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
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

  let content: Blob | string
  let mimeType: string
  let ext: string

  switch (format) {
    case 'pdf':
      content = generatePdfBlob(data)
      mimeType = 'application/pdf'
      ext = 'pdf'
      break
    case 'csv':
      content = generateCsvContent(data)
      mimeType = 'text/csv'
      ext = 'csv'
      break
  }

  downloadFile(content, `${filenameBase}.${ext}`, mimeType)
  return gate
}
