// currencyFormat — Sprint 1 batch B skeleton (FE-002).
//
// Stubbed formatter. Sprint 2 will:
//   - convert `amountUsd * rate`
//   - use Intl.NumberFormat with the target currency locale
//   - round to sensible nearest unit (e.g. ₹999 not ₹998.72)

/**
 * Format a USD amount as the target currency string.
 *
 * TODO(sprint-2): implement real conversion + Intl.NumberFormat.
 */
export function formatCurrency(
  amountUsd: number,
  currency: string,
  rate: number,
): string {
  void currency
  void rate
  return `$${amountUsd}`
}

export default formatCurrency
