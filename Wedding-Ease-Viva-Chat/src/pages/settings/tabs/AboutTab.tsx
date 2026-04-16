// AboutTab — Sprint 2 (Yuki). Settings & Profile redesign, PRD §5.
//
// Read-only surface: app version, build environment, legal/help links, and
// a small attribution. No mutations, no network calls.

import React from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ExternalLink, FileText, Shield, LifeBuoy } from 'lucide-react'
import TabShell from './_TabShell'

// Sprint 4 (Hana) — sourced from package.json via Vite `define` (Marcus QA M-7).
// See vite.config.ts and src/vite-env.d.ts for the global declarations.
const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
const APP_ENVIRONMENT: string =
  (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE ?? 'development'

interface LinkItem {
  label: string
  description: string
  href: string
  Icon: React.ElementType
  external?: boolean
}

const LINKS: LinkItem[] = [
  {
    label: 'Terms of Service',
    description: 'The agreement between you and WeddingEase.',
    href: '/terms',
    Icon: FileText,
  },
  {
    label: 'Privacy Policy',
    description: 'How we collect, store, and protect your data.',
    href: '/privacy',
    Icon: Shield,
  },
  {
    label: 'Help center',
    description: 'Email our team for guides, tutorials, and contact options.',
    href: 'mailto:support@weddingease.com',
    Icon: LifeBuoy,
    external: true,
  },
]

function LinkRow({ item }: { item: LinkItem }) {
  const { label, description, href, Icon, external } = item

  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      aria-label={label}
      className="flex min-h-11 w-full items-start gap-3 rounded-xl bg-white/[0.04] p-3 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 text-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {external && <ExternalLink aria-hidden="true" className="h-3 w-3 text-muted-foreground" />}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </a>
  )
}

export function AboutTab() {
  return (
    <TabShell
      title="About"
      description="Version information and links to legal, status, and help resources."
    >
      {/* Version + environment */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">WeddingEase</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              The official WeddingEase web client.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="secondary" className="bg-muted text-foreground">
              v{APP_VERSION}
            </Badge>
            <Badge variant="outline" className="bg-white/[0.06] text-muted-foreground border-0">
              {APP_ENVIRONMENT}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Links */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold">Resources</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Legal, status, and help resources for WeddingEase.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {LINKS.map((item) => (
            <LinkRow key={item.label} item={item} />
          ))}
        </div>
      </Card>

      {/* Credit */}
      <Card className="p-6 text-center">
        <Separator className="mb-4 bg-white/[0.06]" />
        <p className="text-xs text-muted-foreground">Built with care by WeddingEase.</p>
      </Card>
    </TabShell>
  )
}

export default AboutTab
