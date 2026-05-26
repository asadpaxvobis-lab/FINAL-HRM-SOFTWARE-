import { supabase } from './supabase'

export type CodeGenOpts = {
  table: string
  column: string
  prefix: string
  width: number
  companyId?: string
}

const lastNumeric = (s: string | null | undefined) => {
  if (!s) return null
  const m = s.match(/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Look up the highest existing numeric suffix that follows `prefix` in a code-like
 * column, then return the next code as `${prefix}${nnnn}` padded to `width`.
 *
 * Falls back to `${prefix}0001` when nothing matches. Scoped to a company when
 * `companyId` is supplied so codes are unique per tenant.
 *
 * NOTE: there is a small race window between read and insert. The database UNIQUE
 * constraint on (company_id, code) catches collisions, and the caller can retry.
 */
export async function nextCode(opts: CodeGenOpts): Promise<string> {
  const pad = (n: number) => `${opts.prefix}${String(n).padStart(opts.width, '0')}`

  let query = supabase
    .from(opts.table)
    .select(opts.column)
    .ilike(opts.column, `${opts.prefix}%`)
    .order(opts.column, { ascending: false })
    .limit(50)
  if (opts.companyId) query = query.eq('company_id', opts.companyId)

  const { data, error } = await query
  if (error || !data || data.length === 0) return pad(1)

  let maxN = 0
  const rows = data as unknown as Array<Record<string, unknown>>
  for (const row of rows) {
    const n = lastNumeric(row[opts.column] as string | null)
    if (n !== null && n > maxN) maxN = n
  }
  return pad(maxN + 1)
}
