import { useContext } from 'react'
import { cardLabel, isRed, rankOf, SUIT_SYMBOL, suitOf, type CardId } from '../engine/cards'
import { GameContext } from './context'

export type ChipVariant = 'known' | 'possible' | 'impossible' | 'out' | 'plain' | 'token'

interface Props {
  card: CardId
  variant?: ChipVariant
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  prob?: number
  onClick?: () => void
  selected?: boolean
  disabled?: boolean
  title?: string
  inspect?: boolean
  /** Play the "discovered" flip once. */
  fresh?: boolean
  className?: string
  style?: React.CSSProperties
}

const INLINE = {
  xs: 'h-6 min-w-[28px] px-1 text-[11px] rounded-[4px]',
  sm: 'h-7 min-w-[32px] px-1.5 text-xs rounded-[5px]',
  md: 'h-9 min-w-[40px] px-2 text-sm rounded-md',
}

/**
 * An ivory playing card. Small sizes are inline rank+suit tokens; lg/xl are
 * proper portrait cards with a serif index and a centred pip.
 */
export function CardChip({ card, variant = 'plain', size = 'sm', prob, onClick, selected, disabled, title, inspect = true, fresh, className = '', style }: Props) {
  const ctx = useContext(GameContext)
  const red = isRed(card)
  const paper = variant === 'known' || variant === 'plain' || selected
  const ink = red ? 'text-crimson' : 'text-inkcard'

  let look: string
  if (paper) look = `paper ${ink}`
  else if (variant === 'token') look = `border border-white/[0.09] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${red ? 'text-rose' : 'text-fg'}`
  else if (variant === 'possible') look = `border border-dashed border-white/15 bg-white/[0.025] ${red ? 'text-rose/85' : 'text-fg-2'}`
  else if (variant === 'impossible') look = 'border border-white/[0.05] text-fg-4 line-through decoration-fg-4/60'
  else look = 'border border-white/[0.04] bg-white/[0.02] text-fg-4'

  const portrait = size === 'lg' || size === 'xl'
  const dims = portrait ? (size === 'xl' ? 'h-[104px] w-[74px] rounded-[9px]' : 'h-[68px] w-12 rounded-[7px]') : INLINE[size]
  const interactive = onClick && !disabled

  const cls = [
    'relative inline-flex select-none items-center justify-center font-semibold tabular-nums leading-none transition-all duration-150',
    dims,
    look,
    selected ? 'z-10 -translate-y-0.5 ring-2 ring-champagne ring-offset-2 ring-offset-ink-850' : '',
    interactive && !selected ? 'cursor-pointer hover:-translate-y-0.5 hover:brightness-[1.04] hover:shadow-[0_8px_18px_-8px_rgba(0,0,0,0.7)]' : '',
    disabled ? 'cursor-not-allowed opacity-25' : '',
    fresh ? 'animate-reveal' : '',
    className,
  ].join(' ')

  const content = portrait ? (
    <>
      <span className={`absolute left-1.5 top-1 flex flex-col items-center leading-none ${size === 'xl' ? 'text-[22px]' : 'text-base'}`}>
        <span className="text-display">{rankOf(card)}</span>
        <span className={size === 'xl' ? 'text-sm' : 'text-[11px]'}>{SUIT_SYMBOL[suitOf(card)]}</span>
      </span>
      <span className={size === 'xl' ? 'mt-3 text-[40px]' : 'mt-2 text-2xl'}>{SUIT_SYMBOL[suitOf(card)]}</span>
      <span className={`absolute bottom-1 right-1.5 rotate-180 leading-none ${size === 'xl' ? 'text-[22px]' : 'text-base'}`}>
        <span className="text-display">{rankOf(card)}</span>
      </span>
    </>
  ) : (
    <>
      <span className="tracking-[-0.02em]">{rankOf(card)}</span>
      <span className="ml-px">{SUIT_SYMBOL[suitOf(card)]}</span>
      {prob !== undefined && variant === 'possible' && <span className="ml-1 font-mono text-[9px] font-normal text-fg-3">{Math.round(prob * 100)}</span>}
    </>
  )

  const hover =
    inspect && ctx
      ? {
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) => ctx.hoverCard(card, e.currentTarget),
          onMouseLeave: () => ctx.hoverCard(null),
        }
      : {}
  if (onClick)
    return (
      <button type="button" aria-label={cardLabel(card)} aria-pressed={selected} className={cls} style={style} onClick={onClick} disabled={disabled} title={title} {...hover}>
        {content}
      </button>
    )
  return (
    <span aria-label={cardLabel(card)} className={cls} style={style} title={title} {...hover}>
      {content}
    </span>
  )
}

/** Face-down card, tinted by team. */
export function CardBack({ team, className = '', style }: { team: 0 | 1; className?: string; style?: React.CSSProperties }) {
  return <span className={`card-back inline-block rounded-[3px] ${className}`} style={{ ['--back' as string]: team === 0 ? '#26365a' : '#4f3320', ...style }} />
}
