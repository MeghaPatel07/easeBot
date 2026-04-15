// PlanBillingTab — Plan & Billing surface for the Settings redesign per
// PRD §6.6 / §7.
//
// As of Sprint 2 FE-013 this tab delegates entirely to <BillingSettings/>,
// which wires the live token-meter, subscription state, invoices, and
// cancel/reactivate actions. All previous stubbed plan-switching UI has
// been removed (see frontend audit: dead code after the BillingSettings
// render was never reachable or useful).

import { BillingSettings } from '@/components/billing/BillingSettings'

import TabShell from './_TabShell'

export function PlanBillingTab() {
  return (
    <TabShell
      title="Plan & Billing"
      description="See your current tier, monthly usage, and upgrade options."
    >
      <BillingSettings />
    </TabShell>
  )
}

export default PlanBillingTab
