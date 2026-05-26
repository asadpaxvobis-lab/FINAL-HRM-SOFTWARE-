import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function ReportBackLink() {
  return (
    <Link to="/reports">
      <Button variant="ghost" size="sm">
        <ArrowLeft className="h-4 w-4" /> All reports
      </Button>
    </Link>
  )
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg border bg-card print:hidden">
      {children}
    </div>
  )
}

export const monthOptions = [
  { v: 0, l: 'January' },
  { v: 1, l: 'February' },
  { v: 2, l: 'March' },
  { v: 3, l: 'April' },
  { v: 4, l: 'May' },
  { v: 5, l: 'June' },
  { v: 6, l: 'July' },
  { v: 7, l: 'August' },
  { v: 8, l: 'September' },
  { v: 9, l: 'October' },
  { v: 10, l: 'November' },
  { v: 11, l: 'December' },
]

export const fmtMoney = (n: number | null | undefined) => {
  if (n == null || isNaN(Number(n))) return '0'
  return Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })
}

export const fmtNum = (n: number | null | undefined, d = 2) => {
  if (n == null || isNaN(Number(n))) return '0'
  return Number(n).toLocaleString('en-PK', { maximumFractionDigits: d })
}

export const printableStyles = `
  @media print {
    body { background: white !important; }
    aside, nav, header.app-topbar, .print\\:hidden { display: none !important; }
    table { font-size: 11px; }
    th, td { padding: 4px !important; }
    .report-table th { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`
