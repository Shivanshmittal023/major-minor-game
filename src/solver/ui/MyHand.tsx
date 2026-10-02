import { cardsOfSet, isMajorSet, SET_DISPLAY_ORDER, SUIT_SYMBOL, suitOfSet } from '../engine/cards'
import { CardChip } from './CardChip'
import { useCtx } from './context'
import { Panel, useNewKeys } from './kit'

export function MyHand() {
  const { state } = useCtx()
  const hand = state.timeline.myHand
  const groups = SET_DISPLAY_ORDER.map((s) => ({ s, cards: cardsOfSet(s).filter((c) => hand.has(c)) })).filter((g) => g.cards.length)
  const ordered = groups.flatMap((g) => g.cards)
  const fresh = useNewKeys(ordered)

  // Fan geometry: cards spread on a shallow arc around the bottom centre.
  const n = ordered.length
  const spread = Math.min(34, 6 + n * 4)
  const step = n > 1 ? spread / (n - 1) : 0
  const overlap = n > 7 ? 30 : 36

  return (
    <Panel eyebrow="Hand" title="My cards" meta={`${hand.size} cards · ${groups.length} set${groups.length === 1 ? '' : 's'} open to ask`} flush>
      {n === 0 ? (
        <p className="p-5 text-[13px] text-fg-3">You're out of cards — your teammates carry on.</p>
      ) : (
        <>
          <div className="relative flex h-[150px] items-end justify-center overflow-hidden pb-4 pt-6">
            <div className="pointer-events-none absolute inset-x-10 bottom-3 h-10 rounded-[50%] bg-black/40 blur-xl" />
            {ordered.map((c, i) => {
              const angle = n > 1 ? -spread / 2 + i * step : 0
              const lift = Math.abs(angle) * 0.35
              return (
                <div
                  key={c}
                  className="relative transition-transform duration-200 hover:z-20 hover:!-translate-y-3"
                  style={{ marginLeft: i === 0 ? 0 : -(74 - overlap), transform: `translateY(${lift}px) rotate(${angle}deg)`, transformOrigin: '50% 120%', zIndex: i }}
                >
                  <CardChip card={c} size="xl" variant="known" fresh={fresh.has(c)} />
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-white/[0.05] px-5 py-3">
            {groups.map(({ s, cards }) => {
              const red = suitOfSet(s) === 'H' || suitOfSet(s) === 'D'
              return (
                <span key={s} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 text-xs text-fg-2">
                  <span className={red ? 'text-rose' : 'text-fg'}>{SUIT_SYMBOL[suitOfSet(s)]}</span>
                  {isMajorSet(s) ? 'Major' : 'Minor'}
                  <span className="font-mono text-[10px] text-fg-4">{cards.length}/6</span>
                </span>
              )
            })}
          </div>
        </>
      )}
    </Panel>
  )
}
