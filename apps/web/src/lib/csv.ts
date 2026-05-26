export function toCsv<T extends Record<string, unknown>>(rows: T[], headers?: (keyof T)[]): string {
  if (rows.length === 0 && !headers) return ''
  const cols = (headers ?? (Object.keys(rows[0] ?? {}) as (keyof T)[])) as string[]
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [cols.join(',')]
  for (const row of rows) {
    lines.push(cols.map((c) => escape((row as Record<string, unknown>)[c])).join(','))
  }
  return lines.join('\r\n')
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let i = 0
  let cur = ''
  let row: string[] = []
  let inQuotes = false
  const cleaned = text.replace(/^\uFEFF/, '')
  while (i < cleaned.length) {
    const ch = cleaned[i]
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          cur += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cur += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(cur)
      cur = ''
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
      i++
      continue
    }
    cur += ch
    i++
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur)
    rows.push(row)
  }
  if (rows.length === 0) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? '').trim()
      })
      return obj
    })
}
