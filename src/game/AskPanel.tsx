import { useEffect } from 'react'
import { cardShort, isRedSet, setGlyph, setKind, setLabel, setOf, type CardId, type SetId } from '../../shared/cards'
import { RULES, teamOfSeat } from '../../shared/rules'
import { client, useClient } from '../net/client'
import { Card } from '../ui/Card'
import { Avatar, Badge, Button, Spinner } from '../ui/kit'
import type { View } from './view'

interface Props {
  v: View
  card: CardId | null
  setCard: (c: CardId | null) => void
  target: number | null
  setTarget: (s: number | null) => void
  focusSet: SetId | null
}

/** The only place a player acts: pick a card you may ask for, pick whom to ask, confirm. */
export function AskPanel({ v, card, setCard, target, setTarget, focusSet }: Props) {
  const st = useClient()
  const pending = !!st.pendingAsk
  const { g } = v

  // Drop selections that stopped being legal (set completed, player emptied…).
  useEffect(() => {
    if (card !== null && !v.askable.some((a) => a.want.includes(card))) setCard(null)
    if (target !== null && !v.canTarget(target)) setTarget(null)
  })

  const confirm = () => {
    if (card === null || target === null || pending) return
    client.ask(target, card)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && v.myTurn && card !== null && target !== null && (e.target as HTMLElement).tagName !== 'INPUT') confirm()
      if (e.key === 'Escape') {
        setCard(null)
        setTarget(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
            {cur.connected ? 'Their move. You can plan yours — tap your cards to see what you could ask for.' : `${cur.name} has disconnected. Their seat is held for them.`}
          </div>
        </div>
        {!cur.connected && v.snap.you.isHost && (
          <Button size="sm" className="mt-3" onClick={() => client.skipTurn()}>
            Skip their turn
          </Button>
        )}
      </Shell>
    )
  }

  if (!g.seats.some((s) => v.canTarget(s.seat)))
    return (
      <Shell eyebrow="Your move" title="Nobody left to ask">
        <p className="text-[13px] text-fg-3">No one on the other team has cards. Declare your team's remaining sets to finish the game.</p>
      </Shell>
    )

  const rows = focusSet !== null ? [...v.askable].sort((a, b) => (a.set === focusSet ? -1 : b.set === focusSet ? 1 : 0)) : v.askable
  const targets = g.seats.filter((s) => s.seat !== v.me && (RULES.allowTeammateAsks || teamOfSeat(s.seat) !== teamOfSeat(v.me!)))

  return (
    <section className="surface relative overflow-hidden rounded-xl border-champagne/30">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(420px 200px at 100% 0%, rgb(230 210 162 / 0.1), transparent 70%)' }} />
      <header className="relative flex min-h-12 items-center justify-between border-b border-white/[0.05] px-4 py-2.5 sm:px-5">
        <div>
          <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-champagne/80">Your move</div>
          <h2 className="text-[13px] font-semibold text-fg">Ask for a card</h2>
        </div>
        <Badge tone="accent">Your turn</Badge>
      </header>

      <div className="relative space-y-4 p-4 sm:p-5">
        <div>
          <Step n={1}>Card you want</Step>
          <div className="space-y-2">
            {rows.map(({ set, have, want }) => {
              const red = isRedSet(set)
              return (
                <div key={set} className={`rounded-lg border p-2 transition-colors ${focusSet === set ? 'border-champagne/30 bg-champagne/[0.04]' : 'border-white/[0.05] bg-black/15'}`}>
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-fg-2">
                      <span className={red ? 'text-rose' : 'text-fg'}>{setGlyph(set)}</span>
                      {setKind(set)}
                    </span>
                    <span className="text-fg-4">you hold {have.map(cardShort).join(' ')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {want.map((c) => (
                      <Card key={c} card={c} size="sm" variant="token" selected={card === c} onClick={() => setCard(card === c ? null : c)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <Step n={2}>Whom to ask</Step>
          <div className="grid grid-cols-2 gap-1.5">
            {targets.map((s) => {
              const ok = v.canTarget(s.seat)
              return (
                <button
                  key={s.seat}
                  type="button"
                  disabled={!ok}
                  onClick={() => setTarget(target === s.seat ? null : s.seat)}
                  className={`flex h-10 items-center gap-2 rounded-lg border px-2 text-left text-[13px] transition-all ${
                    target === s.seat ? 'border-champagne/50 bg-champagne/[0.09] text-fg' : 'border-white/[0.07] bg-white/[0.02] text-fg-2 hover:border-white/15 hover:text-fg'
                  } disabled:cursor-not-allowed disabled:opacity-30`}
                >
                  <Avatar name={s.name} team={s.team} size={24} dim={!s.connected} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="font-mono text-[10px] text-fg-4">{s.cardCount}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-fg-4">Or tap a highlighted seat at the table.</p>
        </div>

        <Button variant="primary" size="xl" className="w-full" disabled={card === null || target === null || pending} onClick={confirm}>
          {pending ? (
            <>
              <Spinner /> Asking…
            </>
          ) : card !== null && target !== null ? (
            <>
              Ask {v.nameOf(target)} for {cardShort(card)}
            </>
          ) : card !== null ? (
            `Now choose whom to ask for ${cardShort(card)}`
          ) : (
            'Choose a card'
          )}
        </Button>
        {card !== null && <p className="-mt-2 text-center text-[11px] text-fg-4">Allowed because you hold a card from {setLabel(setOf(card))}.</p>}
      </div>
    </section>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">
      <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white/10 text-[9px] text-fg-3">{n}</span>
      {children}
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
