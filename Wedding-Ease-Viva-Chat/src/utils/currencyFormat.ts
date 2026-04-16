// Real USD → target currency formatter using Intl.NumberFormat.
// Rounds to nearest sensible unit so prices read cleanly (₹1,299 not ₹1,298.72).

function pickLocale(currency: string): string {
  switch (currency.toUpperCase()) {
    case 'INR': return 'en-IN'
    case 'GBP': return 'en-GB'
    case 'EUR': return 'de-DE'
    case 'AED': return 'ar-AE'
    case 'SGD': return 'en-SG'
    case 'AUD': return 'en-AU'
    case 'CAD': return 'en-CA'
    default:    return 'en-US'
  }
}

function roundForDisplay(amount: number, currency: string): number {
  const c = currency.toUpperCase()
  // Zero-decimal currencies or big-number locales: round to whole units.
  if (['INR', 'JPY', 'KRW', 'IDR', 'VND', 'AED'].includes(c)) {
    return Math.round(amount)
  }
  // Everything else keeps 2 decimals.
  return Math.round(amount * 100) / 100
}

export function formatCurrency(
  amountUsd: number,
  currency: string,
  rate: number,
): string {
  const target = currency.toUpperCase()
  const converted = amountUsd * (Number.isFinite(rate) && rate > 0 ? rate : 1)
  const rounded = roundForDisplay(converted, target)
  try {
    return new Intl.NumberFormat(pickLocale(target), {
      style: 'currency',
      currency: target,
      maximumFractionDigits: ['INR', 'JPY', 'KRW', 'IDR', 'VND', 'AED'].includes(target) ? 0 : 2,
    }).format(rounded)
  } catch {
    return `$${amountUsd.toFixed(2)}`
  }
}

export default formatCurrency
