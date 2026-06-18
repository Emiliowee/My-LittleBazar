import { forwardRef } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const SearchField = forwardRef(function SearchField(
  { value, onChange, onKeyDown, placeholder = 'Buscar…', kbd, width = 'w-60', className, ...rest },
  ref,
) {
  const hasValue = !!value && value.length > 0
  return (
    <div
      data-no-barcode="true"
      className={cn(
        'group relative inline-flex h-7 items-center rounded-md border border-transparent bg-transparent transition-[background-color,border-color] duration-120',
        'hover:border-[var(--mlb-border)] hover:bg-[var(--mlb-bg-hover)]',
        'focus-within:border-[var(--mlb-accent)]/35 focus-within:bg-[var(--mlb-bg-input)] focus-within:shadow-[inset_0_0_0_1px_var(--mlb-accent-ring)]',
        width,
        className,
      )}
    >
      <Search
        className="pointer-events-none ml-2 size-3.5 shrink-0 text-[var(--mlb-text-muted)]"
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        ref={ref}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-no-barcode="true"
        role="searchbox"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-2 text-[12.5px] leading-none tracking-[-0.003em] text-[var(--mlb-text-primary)] outline-none placeholder:text-[var(--mlb-text-muted)]"
        {...rest}
      />
      {hasValue ? (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => onChange('')}
          className="mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded text-[var(--mlb-text-muted)] hover:bg-[var(--mlb-bg-active)] hover:text-[var(--mlb-text-primary)]"
        >
          <X className="size-3" strokeWidth={2} />
        </button>
      ) : kbd ? (
        <kbd className="mr-2 hidden select-none items-center rounded border border-[var(--mlb-border)] bg-[var(--mlb-bg-input)] px-1 font-mono text-[9.5px] text-[var(--mlb-text-muted)] sm:inline-flex">
          {kbd}
        </kbd>
      ) : null}
    </div>
  )
})
