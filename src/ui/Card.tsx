import { cardLabel, isJoker, isRed, JOKER_COLOURFUL, pipOf, rankOf, type CardId } from '../../shared/cards'
import type { TeamId } from '../../shared/rules'
import { TEAM_STYLE } from './kit'

export type CardVariant = 'face' | 'token' | 'ghost' | 'out'

interface Props {
  card: CardId
  variant?: CardVariant
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  onClick?: () => void
  selected?: boolean
  disabled?: boolean
  title?: string
  /** Play the "arrived" flip once. */
  fresh?: boolean
  className?: string
  style?: React.CSSProperties
}

const INLINE = {
  xs: 'h-6 min-w-[28px] px-1 text-[11px] rounded-[4px]',
  sm: 'h-7 min-w-[32px] px-1.5 text-xs rounded-[5px]',
  md: 'h-9 min-w-[40px] px-2 text-sm rounded-md',
}
const PORTRAIT = {
  lg: 'h-[68px] w-12 rounded-[7px]',
  xl: 'h-[104px] w-[74px] rounded-[9px]',
  '2xl': 'h-[132px] w-[94px] rounded-[11px]',
}

/**
 * The ivory playing card from the Solver. Small sizes are inline rank+suit
 * tokens; lg and up are portrait cards with serif indices and a centred pip.
 */
export function Card({ card, variant = 'face', size = 'sm', onClick, selected, disabled, title, fresh, className = '', style }: Props) {
  const red = isRed(card)
  const ink = red ? 'text-crimson' : 'text-inkcard'
  let look: string
  if (variant === 'face' || selected) look = `paper ${ink}`
  else if (variant === 'token') look = `border border-white/[0.09] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${red ? 'text-rose' : 'text-fg'}`
  else if (variant === 'ghost') look = `border border-dashed border-white/15 bg-white/[0.025] ${red ? 'text-rose/85' : 'text-fg-2'}`
  else look = 'border border-white/[0.04] bg-white/[0.02] text-fg-4'

  const portrait = size === 'lg' || size === 'xl' || size === '2xl'
  const dims = portrait ? PORTRAIT[size] : INLINE[size]
  const interactive = onClick && !disabled
  const cls = [
    'relative inline-flex shrink-0 select-none items-center justify-center font-semibold tabular-nums leading-none transition-all duration-150',
    dims,
    look,
    selected ? 'z-10 -translate-y-0.5 ring-2 ring-champagne ring-offset-2 ring-offset-ink-850' : '',
    interactive && !selected ? 'cursor-pointer hover:-translate-y-0.5 hover:brightness-[1.04] hover:shadow-[0_8px_18px_-8px_rgba(0,0,0,0.7)]' : '',
    disabled ? 'cursor-not-allowed opacity-25' : '',
    fresh ? 'animate-reveal' : '',
    className,
  ].join(' ')

  const joker = isJoker(card)
  // The Colourful Joker's star carries the only multi-colour ink in the deck — muted, like printed foil.
  const pipStyle: React.CSSProperties | undefined =
    card === JOKER_COLOURFUL && (variant === 'face' || selected)
      ? { backgroundImage: 'linear-gradient(135deg, #b3261e 10%, #c9922e 40%, #3d7a57 65%, #3a5aa6 90%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
      : undefined
  const pip = <span style={pipStyle}>{pipOf(card)}</span>
  const idx = joker ? ({ lg: 'text-[11px]', xl: 'text-[15px]', '2xl': 'text-[19px]' } as const) : ({ lg: 'text-base', xl: 'text-[22px]', '2xl': 'text-[28px]' } as const)
  const pipSize = { lg: 'mt-2 text-2xl', xl: 'mt-3 text-[40px]', '2xl': 'mt-4 text-[52px]' } as const
  const content = portrait ? (
    <>
      <span className={`absolute left-1.5 top-1 flex flex-col items-center leading-none ${idx[size]}`}>
        <span className="text-display">{rankOf(card)}</span>
        <span className={size === 'lg' ? 'text-[11px]' : 'text-sm'}>{pip}</span>
      </span>
      <span className={pipSize[size]}>{pip}</span>
      {joker && <span className="absolute bottom-1.5 left-0 right-0 text-center font-mono text-[7px] uppercase tracking-[0.2em] opacity-60">{size === 'lg' ? '' : 'Joker'}</span>}
      {!joker && (
        <span className={`absolute bottom-1 right-1.5 rotate-180 leading-none ${idx[size]}`}>
          <span className="text-display">{rankOf(card)}</span>
        </span>
      )}
    </>
  ) : (
    <>
      <span className={`tracking-[-0.02em] ${joker ? 'text-[0.85em]' : ''}`}>{rankOf(card)}</span>
      <span className="ml-px">{pip}</span>
    </>
  )

  if (onClick)
    return (
      <button type="button" aria-label={cardLabel(card)} aria-pressed={selected} className={cls} style={style} onClick={onClick} disabled={disabled} title={title}>
        {content}
      </button>
    )
  return (
    <span aria-label={cardLabel(card)} className={cls} style={style} title={title}>
      {content}
    </span>
  )
}

/** Face-down card, tinted by team. */
export function CardBack({ team, className = '', style }: { team: TeamId | null; className?: string; style?: React.CSSProperties }) {
  return <span className={`card-back inline-block rounded-[3px] ${className}`} style={{ ['--back' as string]: team === null ? '#2a3040' : TEAM_STYLE[team].back, ...style }} />
}
