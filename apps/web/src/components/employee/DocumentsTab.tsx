import { useEffect, useRef, useState } from 'react'
import { Loader2, Upload, FileText, Trash2, Download, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { DOC_TYPES } from '@/lib/constants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type DocRow = {
  id: string
  doc_type: string
  title: string
  storage_path: string
  file_size: number | null
  mime_type: string | null
  issued_on: string | null
  expires_on: string | null
  notes: string | null
  created_at: string
}

const BUCKET = 'employee-documents'

const formatSize = (b: number | null) => {
  if (!b) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

const isExpired = (d: string | null) => !!d && new Date(d) < new Date()
const expiresSoon = (d: string | null) => {
  if (!d) return false
  const diff = (new Date(d).getTime() - Date.now()) / 86_400_000
  return diff >= 0 && diff <= 30
}

export function DocumentsTab({ employeeId }: { employeeId: string }) {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('employee.update')
  const [rows, setRows] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [meta, setMeta] = useState({ doc_type: 'CNIC', title: '', issued_on: '', expires_on: '', notes: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
    if (error) toast.error('Failed to load documents', { description: error.message })
    else setRows((data ?? []) as DocRow[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [employeeId])

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEdit) return
    const file = fileRef.current?.files?.[0]
    if (!file) {
      toast.error('Pick a file first')
      return
    }
    if (!meta.title.trim()) {
      toast.error('Title is required')
      return
    }
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9_.\-]/g, '_')
    const path = `${employeeId}/${Date.now()}_${safeName}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    })
    if (upErr) {
      setUploading(false)
      toast.error('Upload failed', { description: upErr.message })
      return
    }
    const { data: ins, error: dbErr } = await supabase
      .from('employee_documents')
      .insert({
        employee_id: employeeId,
        doc_type: meta.doc_type,
        title: meta.title.trim(),
        storage_path: path,
        file_size: file.size,
        mime_type: file.type || null,
        issued_on: meta.issued_on || null,
        expires_on: meta.expires_on || null,
        notes: meta.notes.trim() || null,
      })
      .select('id')
      .single()
    if (dbErr) {
      await supabase.storage.from(BUCKET).remove([path])
      setUploading(false)
      toast.error('Save failed', { description: dbErr.message })
      return
    }
    await writeAuditLog({ action: 'CREATE', entityType: 'employee_document', entityId: ins?.id, after: { title: meta.title, path } })
    setUploading(false)
    setMeta({ doc_type: 'CNIC', title: '', issued_on: '', expires_on: '', notes: '' })
    if (fileRef.current) fileRef.current.value = ''
    toast.success('Document uploaded')
    void load()
  }

  const download = async (r: DocRow) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.storage_path, 120)
    if (error || !data?.signedUrl) {
      toast.error('Cannot fetch file', { description: error?.message })
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  const remove = async (r: DocRow) => {
    if (!confirm(`Delete ${r.title}?`)) return
    const { error: stErr } = await supabase.storage.from(BUCKET).remove([r.storage_path])
    if (stErr) {
      toast.error('Storage delete failed', { description: stErr.message })
      return
    }
    const { error: dbErr } = await supabase.from('employee_documents').delete().eq('id', r.id)
    if (dbErr) {
      toast.error('Delete failed', { description: dbErr.message })
      return
    }
    await writeAuditLog({ action: 'DELETE', entityType: 'employee_document', entityId: r.id })
    toast.success('Document deleted')
    void load()
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload document</CardTitle>
            <CardDescription>Stored privately in Supabase Storage. Max 50 MB per file.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onUpload}>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={meta.doc_type} onChange={(e) => setMeta({ ...meta, doc_type: e.target.value })}>
                    {DOC_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Title</Label>
                  <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Issued on</Label>
                  <Input type="date" value={meta.issued_on} onChange={(e) => setMeta({ ...meta, issued_on: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Expires on</Label>
                  <Input type="date" value={meta.expires_on} onChange={(e) => setMeta({ ...meta, expires_on: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Input type="file" ref={fileRef} className="max-w-md" />
                <Button type="submit" disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All documents</CardTitle>
          <CardDescription>{rows.length} file(s)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No documents uploaded.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.doc_type} · {formatSize(r.file_size)}
                      {r.mime_type ? ` · ${r.mime_type}` : ''}
                    </div>
                  </div>
                  {r.issued_on && (
                    <Badge variant="outline" className="tabular-nums">Issued {r.issued_on}</Badge>
                  )}
                  {r.expires_on && (
                    <Badge
                      variant={isExpired(r.expires_on) ? 'warm' : expiresSoon(r.expires_on) ? 'warm' : 'outline'}
                      className="tabular-nums flex items-center gap-1"
                    >
                      {(isExpired(r.expires_on) || expiresSoon(r.expires_on)) && <AlertTriangle className="h-3 w-3" />}
                      Expires {r.expires_on}
                    </Badge>
                  )}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" title="Download" onClick={() => void download(r)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    {canEdit && (
                      <Button variant="ghost" size="sm" title="Delete" onClick={() => void remove(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
