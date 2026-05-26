export const PK_BANKS = [
  'Allied Bank Limited (ABL)',
  'Askari Bank',
  'Bank Alfalah',
  'Bank Al-Habib',
  'Bank of Punjab (BOP)',
  'Faysal Bank',
  'Habib Bank Limited (HBL)',
  'JS Bank',
  'MCB Bank',
  'Meezan Bank',
  'National Bank of Pakistan (NBP)',
  'Silk Bank',
  'Soneri Bank',
  'Standard Chartered',
  'Summit Bank',
  'United Bank Limited (UBL)',
  'Other',
] as const

/** Normalize PK IBAN: strip spaces, uppercase. */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

export function isValidPkIban(iban: string): boolean {
  const v = normalizeIban(iban)
  return /^PK[0-9]{2}[A-Z0-9]{20}$/.test(v)
}
