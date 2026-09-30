import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { TeamId } from '../../shared/rules'

/**
 * The Ink & Ivory design system — ported from the Major–Minor Solver so both
 * products share one visual language: layered ink surfaces, ivory cards, Tide vs
 * Ember team hues, a single champagne accent, serif display type.
 */

export const TEAM_STYLE = [
  { name: 'Tide', hex: '#86aaf0', rgb: '134 170 240', text: 'text-tide', back: '#26365a' },
  { name: 'Ember', hex: '#e79a5c', rgb: '231 154 92', text: 'text-ember', back: '#4f3320' },
] as const

export function Panel({ title, eyebrow, meta, actions, children, className = '', flush = false }: {
  title?: ReactNode
  eyebrow?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  flush?: boolean
}) {
  return (
    <section className={`surface relative rounded-xl ${className}`}>
      {(title || actions || meta) && (
        <header className="flex min-h-12 items-center justify-between gap-4 border-b border-white/[0.05] px-4 py-2.5 sm:px-5">
          <div className="min-w-0">
            {eyebrow && <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">{eyebrow}</div>}
            <div className="flex items-baseline gap-2.5">
              {title && <h2 className="truncate text-[13px] font-semibold tracking-[-0.005em] text-fg">{title}</h2>}
              {meta && <span className="truncate text-xs text-fg-3">{meta}</span>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'p-4 sm:p-5'}>{children}</div>
    </section>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'hit' | 'miss'

const BTN: Record<Variant, string> = {
  primary:
    'bg-ivory text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.5)] hover:bg-white active:translate-y-px disabled:bg-white/[0.06] disabled:text-fg-4 disabled:shadow-none',
  secondary:
    'border border-white/10 bg-white/[0.04] text-fg hover:border-white/20 hover:bg-white/[0.07] active:translate-y-px disabled:text-fg-4 disabled:hover:bg-white/[0.04]',
  ghost: 'text-fg-2 hover:bg-white/[0.06] hover:text-fg disabled:text-fg-4 disabled:hover:bg-transparent',
  hit:
    'bg-sage text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_2px_rgba(0,0,0,0.5)] hover:brightness-110 active:translate-y-px disabled:bg-white/[0.06] disabled:text-fg-4 disabled:shadow-none',
  miss:
    'border border-rose/30 bg-rose/10 text-rose hover:bg-rose/15 active:translate-y-px disabled:border-white/5 disabled:bg-white/[0.03] disabled:text-fg-4',
}

export function Button({ variant = 'secondary', size = 'md', className = '', children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const sz = { sm: 'h-7 px-2.5 text-xs', md: 'h-8 px-3 text-[13px]', lg: 'h-10 px-4 text-sm', xl: 'h-12 px-5 text-[15px]' }[size]
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne ${sz} ${BTN[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Kbd({ children, onLight = false }: { children: ReactNode; onLight?: boolean }) {
  return (
    <kbd
      className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1 font-mono text-[10px] font-medium ${
        onLight ? 'bg-black/10 text-black/55' : 'border border-white/10 bg-white/[0.04] text-fg-3'
      }`}
    >
      {children}
    </kbd>
  )
}

export function Segmented<T extends string>({ value, onChange, options, disabled = false }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; hint?: string }[]
  disabled?: boolean
}) {
  return (
    <div className={`inline-flex flex-wrap rounded-lg border border-white/[0.06] bg-black/25 p-0.5 ${disabled ? 'pointer-events-none opacity-70' : ''}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all duration-150 ${
            value === o.value ? 'bg-white/[0.09] text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.4)]' : 'text-fg-3 hover:text-fg-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function TeamDot({ team, size = 6 }: { team: TeamId; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: TEAM_STYLE[team].hex, boxShadow: `0 0 0 2px rgb(${TEAM_STYLE[team].rgb} / 0.14)` }}
    />
  )
}

/** Monogram avatar; team-ringed when seated, neutral otherwise. */
export function Avatar({ name, team, size = 28, active = false, dim = false }: { name: string; team: TeamId | null; size?: number; active?: boolean; dim?: boolean }) {
  const t = team === null ? { hex: '#b4aea4', rgb: '180 174 164' } : TEAM_STYLE[team]
  const initials = name === 'You' ? 'You' : name.slice(0, 2)
  return (
    <span
      className={`relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${active ? 'animate-turn' : ''} ${dim ? 'opacity-40' : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: initials.length > 2 ? size * 0.3 : size * 0.38,
        color: t.hex,
        background: `radial-gradient(circle at 30% 25%, rgb(${t.rgb} / 0.28), rgb(${t.rgb} / 0.08))`,
        boxShadow: `inset 0 0 0 1px rgb(${t.rgb} / 0.45)${active ? ', 0 0 0 2px #e6d2a2' : ''}`,
      }}
    >
      {initials}
    </span>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'good' | 'bad' | 'team0' | 'team1'; children: ReactNode }) {
  const cls = {
    neutral: 'border-white/10 bg-white/[0.04] text-fg-2',
    accent: 'border-champagne/30 bg-champagne/10 text-champagne',
    good: 'border-sage/30 bg-sage/10 text-sage',
    bad: 'border-rose/30 bg-rose/10 text-rose',
    team0: 'border-tide/30 bg-tide/10 text-tide',
    team1: 'border-ember/30 bg-ember/10 text-ember',
  }[tone]
  return <span className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[11px] font-medium ${cls}`}>{children}</span>
}

export function Check({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  )
}

export function Cross({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative h-8 w-7 shrink-0">
        <span className="card-back absolute inset-0 rotate-[-10deg] rounded-[4px]" style={{ ['--back' as string]: '#26365a' }} />
        <span className="paper absolute inset-0 flex rotate-[6deg] items-center justify-center rounded-[4px] text-sm text-inkcard">♠</span>
      </span>
      <div className="leading-none">
        <div className={`text-display text-fg ${compact ? 'text-lg' : 'text-[22px]'}`}>Major–Minor</div>
        {!compact && <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-fg-4">Live table</div>}
      </div>
    </div>
  )
}

/** Items that appeared since the previous render (not on first mount) — drives reveal animations. */
export function useNewKeys<T>(items: T[]): Set<T> {
  const prev = useRef<Set<T> | null>(null)
  const [fresh, setFresh] = useState<Set<T>>(new Set())
  const key = items.join('|')
  useEffect(() => {
    const now = new Set(items)
    if (prev.current) {
      const added = new Set([...now].filter((x) => !prev.current!.has(x)))
      if (added.size) {
        setFresh(added)
        const id = setTimeout(() => setFresh(new Set()), 900)
        prev.current = now
        return () => clearTimeout(id)
      }
    }
    prev.current = now
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return fresh
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}
