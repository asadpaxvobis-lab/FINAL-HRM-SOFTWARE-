import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { writeAuditLog } from '@/lib/audit'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

export type DeleteEmployeeTarget = {
  id: string
  full_name: string
  employee_code: string
}

type Mode = 'confirm-delete' | 'offer-deactivate'

export function DeleteEmployeeDialog({
  employee,
  onOpenChange,
  onDeleted,
}: {
  employee: DeleteEmployeeTarget | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<Mode>('confirm-delete')

  useEffect(() => {
    if (!employee) setMode('confirm-delete')
  }, [employee])

  const open = employee !== null

  const runDelete = async () => {
    if (!employee) return
    setBusy(true)
    try {
      const { error } = await supabase.from('employees').delete().eq('id', employee.id)
      if (error) {
        const restricted = error.code === '23503' || /foreign key|violates/i.test(error.message)
        if (restricted) {
          setMode('offer-deactivate')
          return
        }
        toast.error('Delete failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'DELETE', entityType: 'employee', entityId: employee.id })
      toast.success('Employee deleted')
      onDeleted()
    } finally {
      setBusy(false)
    }
  }

  const runDeactivate = async () => {
    if (!employee) return
    setBusy(true)
    try {
      const { error } = await supabase
        .from('employees')
        .update({ is_active: false, employment_status: 'Terminated' })
        .eq('id', employee.id)
      if (error) {
        toast.error('Deactivate failed', { description: error.message })
        return
      }
      await writeAuditLog({
        action: 'UPDATE',
        entityType: 'employee',
        entityId: employee.id,
        after: { is_active: false, employment_status: 'Terminated' },
      })
      toast.success('Employee deactivated')
      onDeleted()
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'offer-deactivate' && employee) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cannot delete employee</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">
                {employee.full_name} ({employee.employee_code})
              </span>{' '}
              has payroll, loan, expense, or letter records on file and cannot be removed. Deactivate instead?
              (Terminated + inactive)
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void runDeactivate()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Deactivate employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete employee?</DialogTitle>
          <DialogDescription>
            This will permanently remove{' '}
            <span className="font-medium text-foreground">
              {employee?.full_name} ({employee?.employee_code})
            </span>
            , including related attendance and leave records. If they have payroll, loans, or expenses on file,
            deletion will be blocked — you can deactivate instead. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void runDelete()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete employee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
