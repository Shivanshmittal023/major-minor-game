import { useEffect, useRef, useState, type ReactNode } from 'react'
import { teamOf } from '../engine/types'
import { TEAM_STYLE } from './context'

/**
 * Shared primitives for the Ink & Ivory system: layered surfaces with hairline
 * borders, a champagne accent for interaction, serif display type for emphasis.
 */

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
        <header className="flex min-h-12 items-center justify-between gap-4 border-b border-white/[0.05] px-5 py-2.5">
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
      <div className={flush ? '' : 'p-5'}>{children}</div>
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

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; hint?: string }[]
}) {
  return (
    <div className="inline-flex rounded-lg border border-white/[0.06] bg-black/25 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all duration-150 ${
            value === o.value
              ? 'bg-white/[0.09] text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.4)]'
              : 'text-fg-3 hover:text-fg-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function TeamDot({ player, team, size = 6 }: { player?: number; team?: 0 | 1; size?: number }) {
  const t = team ?? teamOf(player ?? 0)
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: TEAM_STYLE[t].hex, boxShadow: `0 0 0 2px rgb(${TEAM_STYLE[t].rgb} / 0.14)` }}
    />
  )
}

/** Monogram avatar with a team ring. */
export function Avatar({ name, player, size = 28, active = false, dim = false }: { name: string; player: number; size?: number; active?: boolean; dim?: boolean }) {
  const t = TEAM_STYLE[teamOf(player)]
  const initials = name === 'You' ? 'You' : name.slice(0, 2)
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${active ? 'animate-turn' : ''} ${dim ? 'opacity-40' : ''}`}
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

/** Circular gauge for probabilities. */
export function Gauge({ value, size = 56, stroke = 4, label }: { value: number; size?: number; stroke?: number; label?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.2,0.7,0.2,1)' }}
        />
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f5f0e6" />
            <stop offset="100%" stopColor="#e6d2a2" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{label}</div>
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
