import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Input } from '@/components/ui/input'
import { flattenNavItems, navSections } from '@/lib/navigation'
import { cn } from '@/lib/utils'

export function GlobalSearch() {
  const { hasPermission } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const allItems = useMemo(() => flattenNavItems(navSections, hasPermission), [hasPermission])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allItems.slice(0, 8)
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.to.toLowerCase().includes(q) ||
        (item.section ?? '').toLowerCase().includes(q)
    )
  }, [allItems, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const goTo = (to: string) => {
    navigate(to)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
      setOpen(true)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
      setOpen(true)
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault()
      goTo(results[activeIndex].to)
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-xs sm:max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search pages…"
        className="pl-9 pr-3 h-9 bg-muted/40 border-muted-foreground/20"
        aria-label="Search pages"
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
      />

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-full min-w-[280px] rounded-lg border bg-popover text-popover-foreground shadow-md overflow-hidden">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No pages found</div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
              {results.map((item, idx) => (
                <li key={item.to}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === activeIndex}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      idx === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
                    )}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => goTo(item.to)}
                  >
                    <div className="font-medium">{item.label}</div>
                    {item.section && (
                      <div className="text-xs text-muted-foreground">{item.section}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t px-3 py-2 text-[10px] text-muted-foreground hidden sm:block">
            ↑↓ navigate · Enter open · Ctrl+K focus
          </div>
        </div>
      )}
    </div>
  )
}
