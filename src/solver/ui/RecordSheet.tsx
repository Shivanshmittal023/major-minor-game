import { useEffect, useState } from 'react'
import { cardLabel, type CardId } from '../engine/cards'
import { seatsOf, type PlayerId } from '../engine/types'
import { canAsk, cardAllowed } from './asks'
import { CardChip } from './CardChip'
import { useCtx } from './context'
import { CardGrid } from './EventComposer'
import { pct } from './format'
import { Avatar, Button, Check, Cross } from './kit'

/**
 * The game's "tap a seat to ask" flow, for recording: tap the player who was
 * asked, confirm who asked (defaults to whoever's turn it is), pick the card
 * from the legal ones, then tap the outcome.
 */
export function RecordSheet({ target, onClose }: { target: PlayerId; onClose: () => void }) {
  const { state, api, name, asker, inspectPlayer } = useCtx()
  const { setup, knowledge: kn, timeline: tl } = state
  const askers = seatsOf(setup).filter((p) => canAsk(state, p, target))
  const [requester, setRequester] = useState<PlayerId>(askers.includes(asker) ? asker : askers.includes(tl.nextTurn) ? tl.nextTurn : (askers[0] ?? tl.nextTurn))
  const [card, setCard] = useState<CardId | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const forced: boolean | null = target === setup.me && card !== null ? tl.myHand.has(card) : null
  const submit = (success: boolean) => {
    if (card === null) return setError('Pick the card that was asked for.')
    const err = api.addEvent({ kind: 'ask', requester, target, card, success })
    if (err) return setError(err)
    api.toast('info', `${name(requester)} → ${name(target)} · ${cardLabel(card)} · ${success ? 'transferred' : 'not held'}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Record an ask of ${name(target)}`}
        className="surface-raised animate-rise flex max-h-[88dvh] w-full max-w-[560px] flex-col rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={name(target)} player={target} size={34} />
            <div className="min-w-0 leading-tight">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Record an ask of</div>
              <div className="flex items-baseline gap-2">
                <span className="text-display truncate text-[24px] text-fg">{name(target)}</span>
                {target !== setup.me && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      inspectPlayer(target)
                    }}
                    className="text-xs text-fg-3 underline-offset-2 hover:text-champagne hover:underline"
                  >
                    details
                  </button>
                )}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <Cross />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Who asked</div>
            <div className="flex flex-wrap gap-1.5">
              {askers.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setRequester(p)
                    setCard(null)
                    setError(null)
                  }}
                  className={`inline-flex h-9 items-center gap-2 rounded-full border pl-1 pr-3 text-[13px] transition-colors ${
                    p === requester ? 'border-champagne/50 bg-champagne/[0.1] text-fg' : 'border-white/[0.08] bg-white/[0.02] text-fg-2'
                  }`}
                >
                  <Avatar name={name(p)} player={p} size={26} active={p === tl.nextTurn} />
                  {name(p)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Card asked for · only legal ones</div>
            <CardGrid
              selected={card}
              onPick={(c) => {
                setCard(c)
                setError(null)
              }}
              allowed={(c) => cardAllowed(state, requester, c)}
              onlyAllowed
            />
          </div>
        </div>

        <footer className="border-t border-white/[0.06] px-4 pt-3 sm:px-5" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
          <div className="mb-2.5 flex min-h-5 flex-wrap items-center gap-x-2 text-[13px] text-fg-2">
            {error ? (
              <span className="text-rose">{error}</span>
            ) : card !== null ? (
              <>
                <span className="text-fg">{name(requester)}</span> asks for <CardChip card={card} size="xs" variant="known" inspect={false} />
                <span className="text-fg-3">
                  {forced !== null ? (forced ? '· you hold it, so you hand it over' : "· you don't hold it") : `· ${pct(kn.cards[card].prob[target])} estimated chance`}
                </span>
              </>
            ) : (
              <span className="text-fg-4">Pick a card, then the outcome.</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="hit" size="xl" disabled={card === null || forced === false} onClick={() => submit(true)}>
              <Check /> Had it
            </Button>
            <Button variant="miss" size="xl" disabled={card === null || forced === true} onClick={() => submit(false)}>
              <Cross /> Didn't
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
