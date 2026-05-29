import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  validatePhoneNumberLength,
  AsYouType,
  type CountryCode,
} from 'libphonenumber-js/min'

export interface PhoneInputValue {
  countryCode: CountryCode
  national: string
}

interface Props {
  value: PhoneInputValue
  onChange: (value: PhoneInputValue) => void
  disabled?: boolean
  error?: string
  placeholder?: string
  className?: string
}

export function toE164(value: PhoneInputValue): string | null {
  if (!value.national) return null
  try {
    const parsed = parsePhoneNumberFromString(value.national, value.countryCode)
    return parsed?.isValid() ? parsed.number : null
  } catch {
    return null
  }
}

export function fromE164(e164: string | null): PhoneInputValue {
  const defaults: PhoneInputValue = { countryCode: 'IN', national: '' }
  if (!e164) return defaults
  try {
    const parsed = parsePhoneNumberFromString(e164)
    if (parsed && parsed.country)
      return { countryCode: parsed.country, national: parsed.nationalNumber }
  } catch {
    /* ignore */
  }
  return defaults
}

export function isValidPhone(value: PhoneInputValue): boolean {
  if (!value.national) return false
  try {
    return isValidPhoneNumber(value.national, value.countryCode)
  } catch {
    return false
  }
}

// Returns a human-readable validation error for the given phone, or null if valid/empty.
// Distinguishes too-short, too-long, invalid-prefix, and invalid-format per the selected country.
export function getPhoneError(value: PhoneInputValue): string | null {
  if (!value.national) return null
  let lengthCheck: ReturnType<typeof validatePhoneNumberLength> | undefined
  try {
    lengthCheck = validatePhoneNumberLength(value.national, value.countryCode)
  } catch {
    return 'Invalid phone number'
  }
  switch (lengthCheck) {
    case 'TOO_SHORT':
      return 'Phone number is too short for the selected country'
    case 'TOO_LONG':
      return 'Phone number is too long for the selected country'
    case 'INVALID_LENGTH':
      return 'Phone number length is invalid for the selected country'
    case 'INVALID_COUNTRY':
      return 'Invalid country code'
    case 'NOT_A_NUMBER':
      return 'Enter digits only'
  }
  // Length is fine — check prefix / overall validity (e.g. invalid leading digit for the country).
  try {
    if (!isValidPhoneNumber(value.national, value.countryCode)) {
      return 'Phone number is not valid for the selected country'
    }
  } catch {
    return 'Invalid phone number'
  }
  return null
}

interface CountryEntry {
  code: CountryCode
  name: string
  dial: string
}

function PhoneInput({
  value,
  onChange,
  disabled,
  error,
  placeholder,
  className,
}: Props) {
  const countries = useMemo<CountryEntry[]>(() => {
    let regionNames: Intl.DisplayNames | null = null
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
    } catch {
      regionNames = null
    }
    const list: CountryEntry[] = getCountries().map((code) => {
      let name: string = code
      try {
        name = regionNames?.of(code) || code
      } catch {
        name = code
      }
      return {
        code,
        name,
        dial: '+' + getCountryCallingCode(code),
      }
    })
    list.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [])

  const current = countries.find((c) => c.code === value.countryCode)

  // Format the national number as the user types, per selected country.
  const formattedNational = useMemo(() => {
    if (!value.national) return ''
    try {
      const formatter = new AsYouType(value.countryCode)
      const formatted = formatter.input(value.national)
      return formatted || value.national
    } catch {
      return value.national
    }
  }, [value.national, value.countryCode])

  // Live length/format validation. Only shown after the user has typed something.
  const liveError = useMemo(() => getPhoneError(value), [value])
  const displayError = error ?? liveError

  // Cap input length at the country's max valid length so the user can't keep typing past it.
  // libphonenumber-js doesn't expose a direct "max length" — derive it by walking up until
  // validatePhoneNumberLength stops returning TOO_SHORT/INVALID_LENGTH. Cached per country.
  const maxLength = useMemo(() => {
    try {
      // Most national numbers are <= 15 digits (E.164 cap). Find the largest length that
      // is not flagged as TOO_LONG for this country.
      for (let len = 15; len >= 4; len--) {
        const probe = '9'.repeat(len)
        const result = validatePhoneNumberLength(probe, value.countryCode)
        if (result !== 'TOO_LONG') return len
      }
    } catch { /* ignore */ }
    return 15
  }, [value.countryCode])

  return (
    <div className={className}>
      <div className="flex gap-2">
        <Select
          value={value.countryCode}
          onValueChange={(v) =>
            onChange({ ...value, countryCode: v as CountryCode })
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-12 w-[100px] rounded-2xl bg-transparent border border-foreground/[0.12] focus:ring-1 focus:ring-primary/20 focus:border-primary/40 text-sm">
            <SelectValue>
              {current ? (
                <span className="text-sm">{current.dial}</span>
              ) : (
                <span className="text-sm">{value.countryCode}</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {countries.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.name} ({c.dial})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={formattedNational}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={maxLength + 6 /* allow spaces/grouping chars from the formatter */}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, maxLength)
            onChange({ ...value, national: digits })
          }}
          className="h-12 px-4 rounded-2xl bg-transparent border border-foreground/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-foreground/25 text-sm text-foreground/90 flex-1"
        />
      </div>
      {displayError ? <p className="text-xs text-destructive mt-1">{displayError}</p> : null}
    </div>
  )
}

export default PhoneInput
