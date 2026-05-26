// =============================================================================
// Loan amortization helpers
// =============================================================================

export type AmortizationRow = {
  installment_no: number
  due_date: string
  amount: number
  principal_portion: number
  interest_portion: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Build an amortization schedule.
 *
 * If `interestRatePct` is 0, this is a pure equal-instalment principal repayment.
 * If it's > 0, we use the standard EMI formula:
 *   EMI = P * r * (1+r)^n / ((1+r)^n - 1)
 * where r is the monthly rate (annual / 12 / 100) and n is the number of installments.
 *
 * Each row carries the principal portion + interest portion broken out, and dates
 * are stepped forward one month at a time (clamping to month end).
 */
export function buildSchedule(
  principal: number,
  installments: number,
  interestRatePct: number,
  startDateIso: string
): AmortizationRow[] {
  const n = Math.max(1, Math.floor(installments))
  const rows: AmortizationRow[] = []

  if (interestRatePct <= 0) {
    const emi = round2(principal / n)
    let cumulative = 0
    for (let i = 1; i <= n; i++) {
      const isLast = i === n
      const amount = isLast ? round2(principal - cumulative) : emi
      cumulative += amount
      rows.push({
        installment_no: i,
        due_date: addMonthsIso(startDateIso, i - 1),
        amount,
        principal_portion: amount,
        interest_portion: 0,
      })
    }
    return rows
  }

  const r = interestRatePct / 100 / 12
  const factor = Math.pow(1 + r, n)
  const emi = round2((principal * r * factor) / (factor - 1))
  let balance = principal
  for (let i = 1; i <= n; i++) {
    const interest = round2(balance * r)
    const isLast = i === n
    const principalPortion = isLast ? round2(balance) : round2(emi - interest)
    const amount = round2(principalPortion + interest)
    balance = round2(balance - principalPortion)
    rows.push({
      installment_no: i,
      due_date: addMonthsIso(startDateIso, i - 1),
      amount,
      principal_portion: principalPortion,
      interest_portion: interest,
    })
  }
  return rows
}

/**
 * Step a YYYY-MM-DD date forward by `months` months, clamping to month end.
 * Implements "same day of next month, or last day if shorter".
 */
function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00')
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastOfTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastOfTarget))
  return d.toISOString().slice(0, 10)
}

export function summarizeSchedule(rows: AmortizationRow[]): { totalPayable: number; totalInterest: number; emi: number } {
  if (rows.length === 0) return { totalPayable: 0, totalInterest: 0, emi: 0 }
  const totalPayable = rows.reduce((s, r) => s + r.amount, 0)
  const totalInterest = rows.reduce((s, r) => s + r.interest_portion, 0)
  return { totalPayable: round2(totalPayable), totalInterest: round2(totalInterest), emi: rows[0].amount }
}
