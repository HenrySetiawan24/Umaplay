export type DateKey = string // Y{year}-{MM}-{half}

export function monthHalfFromDay(day: number): 1 | 2 {
  return day <= 1 ? 1 : 2
}

export function toDateKey(year: number, month: number, day: number): DateKey {
  const half = monthHalfFromDay(day)
  const mm = String(month).padStart(2, '0')
  return `Y${year}-${mm}-${half}`
}

export function parseDateKey(dk: string): { year: number; month: number; half: number } {
  const parts = dk.split('-')
  return {
    year: parseInt(parts[0][1]),
    month: parseInt(parts[1]),
    half: parseInt(parts[2]),
  }
}

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function monthHalfLabel(month: number, half: number): string {
  return `${half === 1 ? 'Early' : 'Late'} ${MONTH_NAMES_SHORT[month - 1]}`
}

export function yearLabel(year: number): string {
  return ['', 'Junior Year', 'Classic Year', 'Senior Year'][year] ?? ''
}

export function orderedDateKeys(): DateKey[] {
  const keys: DateKey[] = []
  for (let year = 1; year <= 3; year++) {
    const startMonth = year === 1 ? 6 : 1
    for (let month = startMonth; month <= 12; month++) {
      keys.push(toDateKey(year, month, 1))
      keys.push(toDateKey(year, month, 2))
    }
  }
  return keys
}

export function nextDateKey(current: DateKey, allKeys: DateKey[]): DateKey | undefined {
  const idx = allKeys.indexOf(current)
  if (idx >= 0 && idx < allKeys.length - 1) return allKeys[idx + 1]
  return undefined
}

export function prevDateKey(current: DateKey, allKeys: DateKey[]): DateKey | undefined {
  const idx = allKeys.indexOf(current)
  if (idx > 0) return allKeys[idx - 1]
  return undefined
}

export function dateKeysForYear(year: number): DateKey[] {
  return orderedDateKeys().filter(dk => parseDateKey(dk).year === year)
}
