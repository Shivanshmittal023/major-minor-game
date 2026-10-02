import { setLabel, setOf } from '../engine/cards'
import { teamLabel, teamOf } from '../engine/types'
import { CardChip } from './CardChip'
import { TEAM_STYLE, useCtx } from './context'
import { exclusionReason, pct } from './format'
import { TeamDot } from './kit'

/** One shared popover that explains everything known about the hovered card. */
export function CardTooltip({ card, rect }: { card: number; rect: DOMRect }) {
  const { state, name } = useCtx()
  const ck = state.knowledge.cards[card]
  const width = 288
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)
  const below = rect.bottom + 8
  const flip = below + 260 > window.innerHeight
  const style: React.CSSProperties = flip ? { left, bottom: window.innerHeight - rect.top + 8, width } : { left, top: below, width }
  const possible = [...ck.possible].sort((a, b) => ck.prob[b] - ck.prob[a])

  return (
    <div className="surface-raised animate-rise pointer-events-none fixed z-50 rounded-xl p-3.5 text-xs" style={style}>
      <div className="mb-3 flex items-center gap-3">
        <CardChip card={card} size="lg" variant={ck.status === 'out' ? 'out' : 'known'} inspect={false} />
        <div className="min-w-0">
          <div className="text-display text-xl leading-tight text-fg">{setLabel(setOf(card))}</div>
          <div className="mt-0.5 text-fg-3">
            {ck.status === 'out' && `Laid down by ${teamLabel(ck.laidDownBy!)}`}
            {ck.status === 'known' && 'Location proven'}
            {ck.status === 'uncertain' && (ck.team !== null ? <span className={TEAM_STYLE[ck.team].text}>Somewhere on {teamLabel(ck.team)}</span> : `${ck.possible.length} possible holders`)}
          </div>
        </div>
      </div>

      {ck.status === 'known' && (
        <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2">
          <span className="text-fg-3">Held by</span>
          <span className="flex items-center gap-1.5 font-medium text-fg">
            <TeamDot player={ck.owner!} /> {name(ck.owner!)}
          </span>
        </div>
      )}

      {ck.status === 'uncertain' && (
        <div className="space-y-1.5">
          {possible.map((p) => (
            <div key={p} className="flex items-center gap-2">
              <TeamDot player={p} />
              <span className="w-20 truncate text-fg-2">{name(p)}</span>
              <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full" style={{ width: `${ck.prob[p] * 100}%`, background: `linear-gradient(90deg, rgb(${TEAM_STYLE[teamOf(p)].rgb} / 0.55), ${TEAM_STYLE[teamOf(p)].hex})` }} />
              </div>
              <span className="w-9 text-right font-mono text-[11px] text-fg-2">{pct(ck.prob[p])}</span>
            </div>
          ))}
          <p className="pt-1 text-[11px] leading-snug text-fg-4">Estimated across every deal consistent with the record.</p>
        </div>
      )}

      {ck.ruledOut.length > 0 && ck.status !== 'out' && (
        <div className="mt-3 border-t border-white/[0.06] pt-2.5">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-4">Ruled out</div>
          <div className="space-y-1">
            {ck.ruledOut.map((r) => (
              <div key={r.player} className="flex gap-2 leading-snug">
                <span className="shrink-0 font-medium text-fg-2">{name(r.player)}</span>
                <span className="truncate text-fg-3">{exclusionReason(state.setup, state.events, r.event)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
