import { useEffect } from 'react'
import { cardShort, isRedSet, setGlyph, setKind, type CardId, type SetId } from '../../shared/cards'
import { teamOfSeat } from '../../shared/rules'
import { client, useClient } from '../net/client'
import { Card } from '../ui/Card'
import { Avatar, Badge, Button, Cross, Spinner, TEAM_STYLE, teamName } from '../ui/kit'
import type { View } from './view'

/**
 * Asking is seat-first: tap an opponent (at the table, or in this panel) →
 * see exactly the cards you may ask them for → tap one to ask.
 */
export function AskPanel({ v, onPick, compact = false }: { v: View; onPick: (seat: number) => void; compact?: boolean }) {
  const { g } = v
  if (compact) return <AskStrip v={v} onPick={onPick} />

  if (v.me === null)
    return (
      <Shell eyebrow="Spectating" title="You're watching">
        <p className="text-[13px] text-fg-3">You're not seated at this table, so you see every public move but hold no cards.</p>
      </Shell>
    )

  if (v.snap.phase !== 'playing') return null

  if (!v.myTurn) {
    const cur = g.seats[g.turn]
    return (
      <Shell eyebrow="Waiting" title={`${cur.name} is thinking`}>
        <div className="flex items-center gap-3">
          <Avatar name={cur.name} team={teamOfSeat(g.turn)} size={40} active />
          <div className="min-w-0 text-[13px] text-fg-3">
            {cur.connected ? 'Their move. Keep track of who asked for what — there is no history to look back on.' : `${cur.name} has disconnected. Their seat is held, and their turn is skipped automatically after a minute.`}
          </div>
        </div>
        {!cur.connected && (
          <Button size="sm" className="mt-3" onClick={() => client.skipTurn()}>
            Skip their turn
          </Button>
        )}
      </Shell>
    )
  }

  const targets = g.seats.filter((s) => v.canTarget(s.seat))
  if (!targets.length)
    return (
      <Shell eyebrow="Your move" title="Nobody left to ask">
        <p className="text-[13px] text-fg-3">No one on the other team has cards. Declare your team's remaining sets to finish the game.</p>
      </Shell>
    )

  return (
    <section className="surface relative overflow-hidden rounded-xl border-champagne/30">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(420px 200px at 100% 0%, rgb(230 210 162 / 0.1), transparent 70%)' }} />
      <header className="relative flex min-h-12 items-center justify-between border-b border-white/[0.05] px-4 py-2.5 sm:px-5">
        <div>
          <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-champagne/80">Your move</div>
          <h2 className="text-[13px] font-semibold text-fg">Tap an opponent to ask them</h2>
        </div>
        <Badge tone="accent">Your turn</Badge>
      </header>
      <div className="relative p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-1.5">
          {targets.map((s) => (
            <button
              key={s.seat}
              type="button"
              onClick={() => onPick(s.seat)}
              className="flex h-11 items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 text-left text-[13px] text-fg-2 transition-all hover:border-champagne/40 hover:text-fg active:translate-y-px"
            >
              <Avatar name={s.name} team={s.team} size={26} dim={!s.connected} />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="font-mono text-[10px] text-fg-4">{s.cardCount}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-fg-4">Or tap a highlighted seat at the table.</p>
      </div>
    </section>
  )
}

/** Phone version: one compact strip — whose move it is, or a swipeable row of opponents to ask. */
function AskStrip({ v, onPick }: { v: View; onPick: (seat: number) => void }) {
  const { g } = v
  if (v.me === null)
    return <p className="surface rounded-xl px-4 py-3 text-[12px] text-fg-3">You're watching — every public move shows on the table.</p>
  if (v.snap.phase !== 'playing') return null
  if (!v.myTurn) {
    const cur = g.seats[g.turn]
    return (
      <div className="surface flex items-center gap-3 rounded-xl px-3.5 py-2.5">
        <Avatar name={cur.name} team={teamOfSeat(g.turn)} size={30} active />
        <div className="min-w-0 flex-1 text-[12px] leading-snug">
          <div className="truncate text-fg">{cur.connected ? `${cur.name} is thinking…` : `${cur.name} disconnected — auto-skip in a minute`}</div>
          <div className="truncate text-fg-4">Remember who asked for what — there's no history.</div>
        </div>
        {!cur.connected && (
          <Button size="sm" onClick={() => client.skipTurn()}>
            Skip
          </Button>
        )}
      </div>
    )
  }
  const targets = g.seats.filter((s) => v.canTarget(s.seat))
  if (!targets.length)
    return <p className="surface rounded-xl border-champagne/30 px-4 py-3 text-[12px] text-fg-2">Nobody on the other team has cards — declare your remaining sets (button by your hand).</p>
  return (
    <div className="surface rounded-xl border-champagne/35 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-champagne">Your move — who do you ask?</span>
        <span className="text-[10px] text-fg-4">or tap a seat</span>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {targets.map((s) => (
          <button
            key={s.seat}
            type="button"
            onClick={() => onPick(s.seat)}
            className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] pl-1 pr-3 text-[13px] text-fg active:translate-y-px active:border-champagne/50"
          >
            <Avatar name={s.name} team={s.team} size={30} dim={!s.connected} />
            {s.name}
            <span className="font-mono text-[10px] text-fg-4">{s.cardCount}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Opponent picked → the cards you may ask them for. One tap asks. */
export function AskSheet({ v, target, focusSet, onClose }: { v: View; target: number; focusSet: SetId | null; onClose: () => void }) {
  const st = useClient()
  const pending = !!st.pendingAsk
  const sv = v.g.seats[target]

  // Close if it stops being possible to ask this player (turn moved on, they ran out of cards…).
  useEffect(() => {
    if (!pending && (!v.myTurn || !v.canTarget(target))) onClose()
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const ask = async (card: CardId) => {
    if (pending) return
    await client.ask(target, card)
    onClose()
  }

  const rows = focusSet !== null ? [...v.askable].sort((a, b) => (a.set === focusSet ? -1 : b.set === focusSet ? 1 : 0)) : v.askable

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div className="surface-raised animate-rise max-h-[88vh] w-full overflow-y-auto rounded-t-2xl sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.06] bg-ink-800/95 px-5 pb-4 pt-5 backdrop-blur-md">
          <Avatar name={sv.name} team={sv.team} size={44} dim={!sv.connected} />
          <div className="min-w-0 flex-1">
            <div className={`font-mono text-[10px] uppercase tracking-[0.16em] ${TEAM_STYLE[sv.team].text}`}>
              {teamName(sv.team)} · {sv.cardCount} card{sv.cardCount === 1 ? '' : 's'}
            </div>
            <h2 className="text-display truncate text-[30px] leading-none text-fg">Ask {sv.name}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <Cross />
          </Button>
        </header>

        <div className="space-y-2.5 p-5">
          <p className="text-xs text-fg-3">Tap the card you want. You can ask for any card from a set you already hold.</p>
          {rows.map(({ set, have, want }) => (
            <div key={set} className={`rounded-xl border p-3 ${focusSet === set ? 'border-champagne/30 bg-champagne/[0.04]' : 'border-white/[0.06] bg-black/20'}`}>
              <div className="mb-2 flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-1.5 text-fg">
                  <span className={isRedSet(set) ? 'text-rose' : 'text-fg'}>{setGlyph(set)}</span>
                  {setKind(set)}
                </span>
                <span className="text-[11px] text-fg-4">you hold {have.map(cardShort).join(' ')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {want.map((c) => (
                  <Card key={c} card={c} size="md" variant="token" disabled={pending} onClick={() => ask(c)} title={`Ask ${sv.name} for ${cardShort(c)}`} className="h-11 min-w-[48px] text-[15px]" />
                ))}
              </div>
            </div>
          ))}
        </div>

        {pending && (
          <div className="pb-safe sticky bottom-0 flex items-center justify-center gap-2 border-t border-white/[0.06] bg-ink-800/95 px-5 py-3 text-[13px] text-champagne backdrop-blur-md">
            <Spinner /> Asking {sv.name}…
          </div>
        )}
      </div>
    </div>
  )
}

function Shell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="surface rounded-xl">
      <header className="flex min-h-12 items-center border-b border-white/[0.05] px-4 py-2.5 sm:px-5">
        <div>
          <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">{eyebrow}</div>
          <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        </div>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}
