import { useEffect, useMemo, useState } from 'react'
import { cardsOfSet, isRedSet, setGlyph, setKind, setLabel, type SetId } from '../../shared/cards'
import { teamOfSeat, type TeamId } from '../../shared/rules'
import { client, useClient } from '../net/client'
import { Card } from '../ui/Card'
import { Avatar, Button, Cross, Spinner, TEAM_STYLE, teamName } from '../ui/kit'
import type { View } from './view'

/** Always-available entry point: any seated player may declare at any time. */
/** Sets you may declare right now: still in play and you hold at least one of their cards. */
export function declarableSets(v: View): SetId[] {
  const held = new Set(v.hand)
  return v.sets.filter((s) => v.g.completed[s] === null && cardsOfSet(s).some((c) => held.has(c)))
}

/** Always-available entry point: any seated player may declare, at any time, a set they hold a card of. */
export function DeclarePanel({ v, onOpen }: { v: View; onOpen: () => void }) {
  if (v.me === null || v.snap.phase !== 'playing') return null
  const n = declarableSets(v).length
  const opp = (1 - teamOfSeat(v.me)) as TeamId
  return (
    <section className="surface rounded-xl">
      <div className="flex items-center justify-between gap-3 p-4 sm:px-5">
        <div className="min-w-0">
          <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Any time</div>
          <div className="text-[13px] font-semibold text-fg">Declare a set</div>
          <div className="mt-0.5 text-xs text-fg-3">
            {n ? `Name who holds all six of a set you have a card of. Wrong, and ${teamName(opp)} take it.` : 'You can declare a set once you hold one of its cards.'}
          </div>
        </div>
        <Button onClick={onOpen} disabled={!n} className="shrink-0 border-champagne/35 text-champagne">
          Declare…
        </Button>
      </div>
    </section>
  )
}

export function DeclareSheet({ v, onClose, initialSet }: { v: View; onClose: () => void; initialSet: SetId | null }) {
  const st = useClient()
  const me = v.me!
  const myTeam = teamOfSeat(me)
  const opp = (1 - myTeam) as TeamId
  const teammates = Array.from({ length: v.n }, (_, s) => s).filter((s) => teamOfSeat(s) === myTeam)
  const held = useMemo(() => new Set(v.hand), [v.hand])
  // Only sets you hold a card of can be declared.
  const openSets = v.sets.filter((s) => v.g.completed[s] === null && cardsOfSet(s).some((c) => held.has(c)))
  const [set, setSet] = useState<SetId | null>(initialSet !== null && openSets.includes(initialSet) ? initialSet : (openSets[0] ?? null))
  const [holders, setHolders] = useState<(number | null)[]>([])
  const [confirming, setConfirming] = useState(false)

  // Cards in your own hand are yours — pre-filled and locked.
  useEffect(() => {
    if (set === null) return
    setHolders(cardsOfSet(set).map((c) => (held.has(c) ? me : null)))
    setConfirming(false)
  }, [set, held, me])

  // The set may be won by someone else while you're choosing.
  useEffect(() => {
    if (set !== null && v.g.completed[set] !== null) {
      client.toast(`${setLabel(set)} was just declared.`, 'info')
      onClose()
    }
  }, [set, v.g.completed, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const complete = holders.length === 6 && holders.every((h) => h !== null)
  const pending = !!st.pendingAsk

  const submit = async () => {
    if (set === null || !complete) return
    if (!confirming) return setConfirming(true)
    const ok = await client.declare(set, holders as number[])
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div className="surface-raised animate-rise max-h-[92vh] w-full overflow-y-auto rounded-t-2xl sm:max-w-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-white/[0.06] px-5 pb-4 pt-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-champagne/80">Declaration</div>
            <h2 className="text-display mt-1 text-[30px] leading-none text-fg">Declare a set</h2>
            <p className="mt-2 text-xs text-fg-3">
              Say which teammate holds each card. All six right: <span className={TEAM_STYLE[myTeam].text}>{teamName(myTeam)}</span> win it. Any mistake:{' '}
              <span className={TEAM_STYLE[opp].text}>{teamName(opp)}</span> take it. The cards are revealed either way.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <Cross />
          </Button>
        </header>

        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">1 · Set <span className="normal-case tracking-normal text-fg-4">— only sets you hold a card of</span></div>
            <div className="flex flex-wrap gap-1.5">
              {openSets.map((s) => {
                const red = isRedSet(s)
                const mine = cardsOfSet(s).filter((c) => held.has(c)).length
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSet(s)}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-all ${
                      s === set ? 'border-champagne/50 bg-champagne/[0.09] text-fg' : 'border-white/[0.07] bg-white/[0.02] text-fg-2 hover:border-white/15 hover:text-fg'
                    }`}
                  >
                    <span className={red ? 'text-rose' : 'text-fg'}>{setGlyph(s)}</span>
                    {setKind(s)}
                    <span className="font-mono text-[10px] text-fg-4">{mine}/6</span>
                  </button>
                )
              })}
            </div>
          </div>

          {set !== null && (
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">2 · Who holds each card</div>
              <div className="space-y-1.5">
                {cardsOfSet(set).map((c, i) => {
                  const locked = held.has(c)
                  return (
                    <div key={c} className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-black/15 p-1.5 pr-2">
                      <Card card={c} size="md" />
                      <div className="flex flex-1 flex-wrap gap-1">
                        {locked ? (
                          <span className="inline-flex h-8 items-center gap-2 px-1 text-xs text-fg-3">
                            <Avatar name="You" team={myTeam} size={22} /> In your hand
                          </span>
                        ) : (
                          teammates.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setHolders((h) => h.map((x, j) => (j === i ? s : x)))}
                              className={`inline-flex h-8 items-center gap-1.5 rounded-md border pl-1 pr-2 text-xs transition-all ${
                                holders[i] === s ? 'border-champagne/50 bg-champagne/[0.09] text-fg' : 'border-white/[0.07] text-fg-3 hover:border-white/15 hover:text-fg'
                              }`}
                            >
                              <Avatar name={v.nameOf(s)} team={myTeam} size={20} />
                              {v.nameOf(s)}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <footer className="pb-safe sticky bottom-0 border-t border-white/[0.06] bg-ink-800/95 px-5 pt-3 backdrop-blur-md">
          {confirming && complete && (
            <p className="mb-2 text-center text-xs text-rose">Sure? If any card is wrong, {teamName(opp)} win {set !== null ? setLabel(set) : 'the set'}.</p>
          )}
          <Button variant="primary" size="xl" className="w-full" disabled={!complete || pending} onClick={submit}>
            {pending ? (
              <>
                <Spinner /> Declaring…
              </>
            ) : !complete ? (
              'Assign every card to a teammate'
            ) : confirming ? (
              `Yes — declare ${set !== null ? setLabel(set) : ''}`
            ) : (
              `Declare ${set !== null ? setLabel(set) : ''}`
            )}
          </Button>
        </footer>
      </div>
    </div>
  )
}
