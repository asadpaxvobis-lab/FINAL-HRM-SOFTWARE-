export const PK_PROVINCES = [
  'Punjab',
  'Sindh',
  'KPK',
  'Balochistan',
  'ICT',
  'AJK',
  'GB',
] as const

export const WEEK_DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const

export const EMPLOYMENT_STATUSES = ['Active', 'Probation', 'Suspended', 'Resigned', 'Terminated'] as const

export const PAY_FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly'] as const
export type PayFrequency = (typeof PAY_FREQUENCIES)[number]

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export const DOC_TYPES = [
  'CNIC',
  'Passport',
  'Driving License',
  'Academic',
  'Experience Letter',
  'Offer Letter',
  'Contract',
  'Resume',
  'Photo',
  'Bank Letter',
  'Medical',
  'Other',
] as const
