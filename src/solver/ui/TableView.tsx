import { useEffect, useRef, useState } from 'react'
import { cardLabel, cardsOfSet, isMajorSet, SET_DISPLAY_ORDER, setLabel, setOf, setShortLabel, SUIT_SYMBOL, suitOfSet, type CardId } from '../engine/cards'
import { teamLabel, teamOf, type PlayerId, type TeamId } from '../engine/types'
import { CardBack, CardChip } from './CardChip'
import { TEAM_STYLE, useCtx } from './context'
import { describeEvent, pct } from './format'
import { Avatar, Badge, Button, Check, Cross, Segmented, TeamDot, useNewKeys } from './kit'

export type KnowledgeTab = 'table' | 'roster' | 'matrix'

export function PlayersPanel({ tab, onTab }: { tab: KnowledgeTab; onTab: (t: KnowledgeTab) => void }) {
  const { state } = useCtx()
  const known = state.knowledge.cards.filter((c) => c.status === 'known').length
  const out = state.knowledge.cards.filter((c) => c.status === 'out').length
  return (
    <section className="surface relative overflow-hidden rounded-2xl">
      <header className="flex items-end justify-between gap-6 px-6 pb-4 pt-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-4">Live table</div>
          <h2 className="text-display mt-1 text-[28px] leading-none text-fg">Players & card knowledge</h2>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden items-center gap-5 text-xs text-fg-3 md:flex">
            <Stat value={known} label="located" />
            <Stat value={48 - known - out} label="uncertain" />
            <Stat value={out} label="laid down" />
          </div>
          <Segmented
            value={tab}
            onChange={onTab}
            options={[
              { value: 'table', label: 'Table', hint: 'T' },
              { value: 'roster', label: 'Roster', hint: 'R' },
              { value: 'matrix', label: 'Card matrix', hint: 'M' },
            ]}
          />
        </div>
      </header>
      <div className="border-t border-white/[0.05]">
        {tab === 'table' && <TableScene />}
        {tab === 'roster' && <Roster />}
        {tab === 'matrix' && <KnowledgeMatrix />}
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-display text-xl leading-none text-fg">{value}</span>
      <span>{label}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Table scene
// ---------------------------------------------------------------------------

function seatPos(p: PlayerId, me: PlayerId) {
  // Me at the bottom centre, then clockwise in seat order.
  const k = (p - me + 8) % 8
  const a = Math.PI / 2 + (k * Math.PI) / 4
  return { x: 50 + 39 * Math.cos(a), y: 50 + 37 * Math.sin(a), a }
}

type Pt = { x: number; y: number }

/** Where each team's pile of completed sets sits, in scene %. Your team's pile is on the left. */
function pilePos(team: TeamId, myTeam: TeamId): Pt {
  return { x: team === myTeam ? 34 : 66, y: 50 }
}

function TableScene() {
  const { state, name, layDown } = useCtx()
  const { setup, timeline: tl, events, knowledge: kn } = state
  const myTeam = teamOf(setup.me)
  const ready = SET_DISPLAY_ORDER.filter((s) => kn.sets[s].heldBy !== null && kn.sets[s].laidDownBy === null)
  const lastEv = events[events.length - 1]
  const last = lastEv ? describeEvent(setup, lastEv) : null

  // Animate card movement: a transfer flies seat → seat; a lay-down sends all six
  // cards from their holders into the team's pile, off the table.
  const [flights, setFlights] = useState<{ id: string; card: CardId; from: Pt; to: Pt; delay: number }[]>([])
  const prevLen = useRef(events.length)
  useEffect(() => {
    const grew = events.length === prevLen.current + 1
    prevLen.current = events.length
    if (!grew || !lastEv) return
    let next: typeof flights = []
    if (lastEv.kind === 'ask' && lastEv.success)
      next = [{ id: lastEv.id, card: lastEv.card, from: seatPos(lastEv.target, setup.me), to: seatPos(lastEv.requester, setup.me), delay: 0 }]
    else if (lastEv.kind === 'declare')
      next = cardsOfSet(lastEv.set).map((c, i) => ({
        id: `${lastEv.id}-${i}`, card: c, from: seatPos(lastEv.holders[i], setup.me), to: pilePos(lastEv.team, myTeam), delay: i * 70,
      }))
    if (!next.length) return
    setFlights(next)
    const t = setTimeout(() => setFlights([]), 1300 + next.length * 70)
    return () => clearTimeout(t)
  }, [events.length, lastEv, setup.me, myTeam])
  const missId = lastEv?.kind === 'ask' && !lastEv.success ? lastEv.id : null

  return (
    <div className="relative h-[660px] min-w-[980px] overflow-hidden">
      {/* table */}
      <div className="absolute left-1/2 top-1/2 h-[44%] w-[50%] -translate-x-1/2 -translate-y-1/2">
        <div
          className="absolute inset-0 rounded-[50%]"
          style={{
            background: 'radial-gradient(ellipse at 50% 30%, #1b2130 0%, #11141c 55%, #0b0d12 100%)',
            boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.07), inset 0 2px 0 rgb(255 255 255 / 0.04), inset 0 -30px 60px rgb(0 0 0 / 0.45), 0 30px 80px -30px rgb(0 0 0 / 0.9)',
          }}
        />
        <div className="absolute inset-[14px] rounded-[50%] border border-white/[0.045]" />
        <div className="absolute inset-[30px] rounded-[50%] border border-dashed border-white/[0.035]" />
        {/* team ticks on the rim, one per seat */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((p) => {
          const { a } = seatPos(p, setup.me)
          return (
            <span
              key={p}
              className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${50 + 50 * Math.cos(a)}%`, top: `${50 + 50 * Math.sin(a)}%`, background: TEAM_STYLE[teamOf(p)].hex, opacity: tl.nextTurn === p ? 1 : 0.55 }}
            />
          )
        })}
        {([myTeam, (1 - myTeam) as TeamId]).map((t) => (
          <Pile key={t} team={t} side={t === myTeam ? 'left' : 'right'} />
        ))}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-[23%] text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-4">Turn</div>
          <div className="text-display text-[56px] leading-[0.95] text-fg">{events.length + 1}</div>
          <div className="mt-1 flex items-center gap-2 text-sm text-fg-2">
            <TeamDot player={tl.nextTurn} />
            {tl.nextTurn === setup.me ? <span className="font-medium text-champagne">Your move</span> : <span>{name(tl.nextTurn)} to play</span>}
          </div>
          {last && (
            <div key={lastEv!.id} className="animate-rise mt-3 max-w-[340px] text-xs text-fg-3">
              <span className="text-fg-2">{last.title}</span>
              <div className={`mt-0.5 flex items-center justify-center gap-1 ${last.ok === false ? 'text-rose' : last.ok ? 'text-sage' : 'text-fg-3'}`}>
                {last.ok === true && <Check className="h-3 w-3" />}
                {last.ok === false && <Cross className="h-3 w-3" />}
                {last.result}
              </div>
            </div>
          )}
          {ready.length > 0 && (
            <div className="pointer-events-auto mt-3 flex flex-col items-center gap-1.5">
              {ready.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => layDown(s)}
                  className="animate-rise inline-flex h-8 items-center gap-2 rounded-full border border-champagne/40 bg-champagne/[0.1] px-3.5 text-xs font-medium text-champagne transition-colors hover:bg-champagne/[0.18]"
                >
                  <TeamDot team={kn.sets[s].heldBy!} />
                  {setLabel(s)} is complete · take it off the table
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {[0, 1, 2, 3, 4, 5, 6, 7].map((p) => {
        const { x, y } = seatPos(p, setup.me)
        return (
          <div key={p} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <Seat p={p} missId={lastEv?.kind === 'ask' && lastEv.target === p ? missId : null} />
          </div>
        )
      })}

      {flights.map((f) => (
        <div
          key={f.id}
          className="animate-fly pointer-events-none absolute z-20"
          style={{
            animationDelay: `${f.delay}ms`,
            ['--x0' as string]: `${f.from.x}%`,
            ['--y0' as string]: `${f.from.y}%`,
            ['--x1' as string]: `${f.to.x}%`,
            ['--y1' as string]: `${f.to.y}%`,
          }}
        >
          <CardChip card={f.card} size="lg" variant="known" inspect={false} className="shadow-[0_20px_40px_-10px_rgba(0,0,0,0.9)]" />
        </div>
      ))}

      <div className="absolute bottom-4 left-6 flex items-center gap-4 text-[11px] text-fg-4">
        <span className="flex items-center gap-1.5"><span className="paper inline-block h-3 w-2.5 rounded-[2px]" /> located card</span>
        <span className="flex items-center gap-1.5"><CardBack team={0} className="h-3 w-2.5" /> unknown card</span>
        <span className="flex items-center gap-1.5"><span className="inline-flex h-3 items-end gap-px"><i className="h-1 w-[3px] bg-fg-3" /><i className="h-2 w-[3px] bg-fg-2" /><i className="h-3 w-[3px] bg-fg" /></span> likely sets</span>
      </div>
    </div>
  )
}

/** A team's completed sets, stacked face down inside the table — out of play. */
function Pile({ team, side }: { team: TeamId; side: 'left' | 'right' }) {
  const { state } = useCtx()
  const sets = SET_DISPLAY_ORDER.filter((s) => state.knowledge.sets[s].laidDownBy === team)
  const fresh = useNewKeys(sets)
  const st = TEAM_STYLE[team]
  return (
    <div className={`absolute top-1/2 flex w-[150px] -translate-y-1/2 flex-col gap-1.5 ${side === 'left' ? 'left-[7%] items-start' : 'right-[7%] items-end'}`}>
      <div className={`flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] ${st.text} opacity-80`}>
        <TeamDot team={team} size={5} /> {st.name} · {sets.length} won
      </div>
      <div className={`flex min-h-[38px] flex-wrap gap-1.5 ${side === 'right' ? 'justify-end' : ''}`}>
        {sets.length === 0 && <span className="flex h-[38px] w-[30px] items-center justify-center rounded-[4px] border border-dashed border-white/[0.08] text-[9px] text-fg-4" />}
        {sets.map((s) => {
          const red = suitOfSet(s) === 'H' || suitOfSet(s) === 'D'
          return (
            <span key={s} className={`relative h-[38px] w-[30px] ${fresh.has(s) ? 'animate-reveal' : ''}`} style={fresh.has(s) ? { animationDelay: '700ms' } : undefined} title={`${setLabel(s)} · laid down by ${teamLabel(team)}`}>
              <CardBack team={team} className="absolute inset-0 h-full w-full -translate-x-[3px] translate-y-px rotate-[-11deg]" />
              <CardBack team={team} className="absolute inset-0 h-full w-full translate-x-[3px] rotate-[8deg]" />
              <span className={`paper absolute inset-0 flex flex-col items-center justify-center rounded-[4px] leading-none ${red ? 'text-crimson' : 'text-inkcard'}`}>
                <span className="text-sm">{SUIT_SYMBOL[suitOfSet(s)]}</span>
                <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide opacity-70">{isMajorSet(s) ? 'Maj' : 'Min'}</span>
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function Seat({ p, missId }: { p: PlayerId; missId: string | null }) {
  const { state, name, inspectPlayer } = useCtx()
  const { setup, knowledge: kn, timeline: tl } = state
  const pk = kn.players[p]
  const t = teamOf(p)
  const isMe = p === setup.me
  const isTurn = tl.nextTurn === p
  const fresh = useNewKeys(pk.known)
  const out = pk.handCount === 0

  return (
    <button
      type="button"
      onClick={() => inspectPlayer(p)}
      className={`surface-raised group relative w-[236px] rounded-xl p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 ${
        isTurn ? 'border-champagne/35' : ''
      } ${out ? 'opacity-45' : ''}`}
    >
      {/* team accent hairline */}
      <span className="absolute inset-x-3 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${TEAM_STYLE[t].hex}, transparent)`, opacity: 0.7 }} />
      {missId && <span key={missId} className="animate-ripple pointer-events-none absolute inset-0 rounded-xl" />}

      <div className="flex items-center gap-2.5">
        <Avatar name={name(p)} player={p} size={30} active={isTurn} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[13px] font-semibold text-fg">{name(p)}</span>
            <span className="font-mono text-[10px] text-fg-4">#{p + 1}</span>
          </div>
          <div className={`text-[11px] ${TEAM_STYLE[t].text} opacity-80`}>{TEAM_STYLE[t].name} · {teamLabel(t)}</div>
        </div>
        <div className="text-right">
          <div className="text-display text-2xl leading-none text-fg">{pk.handCount}</div>
          <div className="text-[10px] text-fg-4">cards</div>
        </div>
      </div>

      {/* hand: located cards face up, the rest face down */}
      <div className="mt-2.5 flex min-h-6 flex-wrap items-center gap-1">
        {pk.known.map((c) => (
          <CardChip key={c} card={c} size="xs" variant="known" fresh={fresh.has(c)} />
        ))}
        {Array.from({ length: Math.max(0, pk.unknownCount) }).map((_, i) => (
          <CardBack key={i} team={t} className="h-6 w-[18px]" />
        ))}
        {out && <span className="text-[11px] text-fg-4">Out of cards</span>}
      </div>

      {!isMe && pk.unknownCount > 0 && <Affinity p={p} />}

      {!isMe && pk.atLeastOne.length > 0 && (
        <div className="mt-2 truncate font-mono text-[10px] text-champagne/70" title="Deduced from this player's own asks">
          ≥1 of {pk.atLeastOne[0].cards.map(cardLabel).join(' ')}
          {pk.atLeastOne.length > 1 && <span className="text-fg-4"> +{pk.atLeastOne.length - 1}</span>}
        </div>
      )}
    </button>
  )
}

/** Expected cards per set for the hidden part of a hand, as paired minor/major bars per suit. */
function Affinity({ p }: { p: PlayerId }) {
  const { state } = useCtx()
  const pk = state.knowledge.players[p]
  const known = new Map<number, number>()
  pk.known.forEach((c) => known.set(setOf(c), (known.get(setOf(c)) ?? 0) + 1))
  return (
    <div className="mt-2.5 flex items-end justify-between border-t border-white/[0.05] pt-2">
      {[0, 1, 2, 3].map((suit) => (
        <div key={suit} className="flex items-end gap-1">
          <span className={`text-[10px] leading-none ${suit === 1 || suit === 2 ? 'text-rose/70' : 'text-fg-3'}`}>{SUIT_SYMBOL[suitOfSet(suit)]}</span>
          {[suit, suit + 4].map((s) => {
            const e = Math.max(0, pk.expectedBySet[s] - (known.get(s) ?? 0))
            const h = Math.min(1, e / 2.2)
            const laid = state.knowledge.sets[s].laidDownBy !== null
            return (
              <span key={s} className="relative h-3.5 w-[5px] overflow-hidden rounded-[2px] bg-white/[0.06]" title={`${setShortLabel(s)} · ~${e.toFixed(1)} hidden card${e >= 0.95 && e < 1.05 ? '' : 's'}`}>
                {!laid && <span className="absolute inset-x-0 bottom-0 rounded-[2px] bg-fg transition-all duration-500" style={{ height: `${h * 100}%`, opacity: 0.35 + h * 0.65 }} />}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

function Roster() {
  const { state, name, inspectPlayer } = useCtx()
  const { setup, knowledge: kn, timeline: tl } = state
  const order = [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => teamOf(a) - teamOf(b) || a - b)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left font-mono text-[10px] uppercase tracking-[0.12em] text-fg-4">
            <th className="px-6 py-3 font-normal">Player</th>
            <th className="px-3 py-3 text-right font-normal">Cards</th>
            <th className="px-3 py-3 font-normal">Located</th>
            <th className="px-3 py-3 font-normal">Hand certainty</th>
            <th className="px-3 py-3 text-right font-normal">Possible</th>
            <th className="px-3 py-3 text-right font-normal">Ruled out</th>
            <th className="px-6 py-3 font-normal">Constraints</th>
          </tr>
        </thead>
        <tbody>
          {order.map((p, i) => {
            const pk = kn.players[p]
            const me = p === setup.me
            const certainty = pk.handCount ? pk.known.length / pk.handCount : 1
            return (
              <tr
                key={p}
                onClick={() => inspectPlayer(p)}
                className={`cursor-pointer border-t align-middle transition-colors hover:bg-white/[0.025] ${i === 4 ? 'border-white/10' : 'border-white/[0.04]'}`}
              >
                <td className="whitespace-nowrap px-6 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={name(p)} player={p} size={24} active={tl.nextTurn === p} dim={pk.handCount === 0} />
                    <span className="font-medium text-fg">{name(p)}</span>
                    <span className="font-mono text-[10px] text-fg-4">#{p + 1}</span>
                    {tl.nextTurn === p && <Badge tone="accent">To play</Badge>}
                  </div>
                </td>
                <td className="text-display px-3 py-2.5 text-right text-lg text-fg">{pk.handCount}</td>
                <td className="px-3 py-2.5">
                  {pk.known.length === 0 ? (
                    <span className="text-fg-4">—</span>
                  ) : (
                    <div className="flex max-w-[280px] flex-wrap gap-1">
                      {pk.known.map((c) => (
                        <CardChip key={c} card={c} size="xs" variant="known" />
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-[5px] w-24 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full" style={{ width: `${certainty * 100}%`, background: TEAM_STYLE[teamOf(p)].hex }} />
                    </div>
                    <span className="font-mono text-[11px] text-fg-3">{pct(certainty)}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-fg-2">{me ? '—' : pk.possible.length}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-fg-2">{me ? '—' : pk.impossible.length}</td>
                <td className="px-6 py-2.5 font-mono text-[11px] text-champagne/75">
                  {pk.atLeastOne.length === 0 ? <span className="text-fg-4">—</span> : pk.atLeastOne.slice(0, 2).map((cl, j) => <div key={j}>≥1 of {cl.cards.map(cardLabel).join(' ')}</div>)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card matrix
// ---------------------------------------------------------------------------

export function KnowledgeMatrix() {
  const { state, name, hoverCard } = useCtx()
  const { knowledge: kn } = state
  const order = [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => teamOf(a) - teamOf(b) || a - b)
  return (
    <div>
      <div className="max-h-[660px] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-ink-850/95 backdrop-blur-sm">
            <tr className="border-b border-white/[0.06]">
              <th className="px-6 py-2.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-fg-4">Card</th>
              {order.map((p, i) => (
                <th key={p} className={`px-1 py-2.5 font-medium text-fg-2 ${i === 4 ? 'border-l border-white/10' : ''}`}>
                  <span className="inline-flex items-center gap-1.5"><TeamDot player={p} />{name(p)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SET_DISPLAY_ORDER.map((s) => kn.sets[s].laidDownBy !== null ? [
              <tr key={`h${s}`}>
                <td colSpan={9} className="border-t border-white/[0.05] px-6 py-2 text-[11px] text-fg-4">
                  <span className="inline-flex items-center gap-2">
                    <span className={suitOfSet(s) === 'H' || suitOfSet(s) === 'D' ? 'text-rose/60' : 'text-fg-3'}>{SUIT_SYMBOL[suitOfSet(s)]}</span>
                    <span className="text-fg-3">{isMajorSet(s) ? 'Major' : 'Minor'}</span>
                    <span>· off the table, laid down by</span>
                    <span className={TEAM_STYLE[kn.sets[s].laidDownBy!].text}>{teamLabel(kn.sets[s].laidDownBy!)}</span>
                  </span>
                </td>
              </tr>,
            ] : [
              <tr key={`h${s}`}>
                <td colSpan={9} className="border-t border-white/[0.05] bg-white/[0.015] px-6 py-1.5 text-[11px] text-fg-3">
                  <span className={suitOfSet(s) === 'H' || suitOfSet(s) === 'D' ? 'text-rose' : 'text-fg-2'}>{SUIT_SYMBOL[suitOfSet(s)]}</span> {isMajorSet(s) ? 'Major' : 'Minor'}
                </td>
              </tr>,
              ...kn.sets[s].cards.map((c) => {
                const ck = kn.cards[c]
                return (
                  <tr key={c} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-6 py-[3px]" onMouseEnter={(e) => hoverCard(c, e.currentTarget)} onMouseLeave={() => hoverCard(null)}>
                      <CardChip card={c} size="xs" variant={ck.status === 'out' ? 'out' : ck.status === 'known' ? 'known' : 'possible'} inspect={false} />
                    </td>
                    {order.map((p, i) => {
                      const sep = i === 4 ? 'border-l border-white/10' : ''
                      if (ck.status === 'out') return <td key={p} className={`text-center text-fg-4 ${sep}`}>—</td>
                      const hex = TEAM_STYLE[teamOf(p)].rgb
                      if (ck.owner === p)
                        return (
                          <td key={p} className={`px-1 text-center ${sep}`}>
                            <span className="inline-flex h-5 w-full max-w-[64px] items-center justify-center rounded-[4px] text-ink-900" style={{ background: `rgb(${hex})` }}>
                              <Check className="h-3 w-3" />
                            </span>
                          </td>
                        )
                      if (!ck.possible.includes(p)) return <td key={p} className={`text-center text-fg-4/60 ${sep}`}>·</td>
                      const x = ck.prob[p]
                      return (
                        <td key={p} className={`px-1 text-center ${sep}`}>
                          <span className="inline-block h-5 w-full max-w-[64px] rounded-[4px] font-mono text-[10px] leading-5 text-fg" style={{ background: `rgb(${hex} / ${(0.05 + x * 0.5).toFixed(3)})` }}>
                            {pct(x)}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              }),
            ])}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 border-t border-white/[0.05] px-6 py-2.5 text-[11px] text-fg-4">
        <span className="flex items-center gap-1.5"><span className="inline-flex h-3.5 w-5 items-center justify-center rounded-[3px] bg-tide text-ink-900"><Check className="h-2.5 w-2.5" /></span> proven</span>
        <span>· impossible</span>
        <span>shaded by estimated chance</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Player drawer
// ---------------------------------------------------------------------------

export function PlayerDrawer({ player, onClose }: { player: number; onClose: () => void }) {
  const { state, name } = useCtx()
  const pk = state.knowledge.players[player]
  const kn = state.knowledge
  const t = teamOf(player)
  const isMe = player === state.setup.me
  const bySet = (cards: CardId[]) => SET_DISPLAY_ORDER.map((s) => ({ s, cs: cards.filter((c) => setOf(c) === s) })).filter((g) => g.cs.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const group = (title: string, cards: CardId[], variant: 'known' | 'possible' | 'impossible', hint: string) => (
    <section className="border-t border-white/[0.05] px-7 py-5">
      <div className="mb-0.5 flex items-baseline justify-between">
        <h4 className="text-[13px] font-semibold text-fg">{title}</h4>
        <span className="text-display text-lg text-fg-2">{cards.length}</span>
      </div>
      <p className="mb-3.5 text-xs text-fg-3">{hint}</p>
      {cards.length === 0 && <div className="text-xs text-fg-4">None</div>}
      <div className="space-y-2">
        {bySet(cards).map(({ s, cs }) => (
          <div key={s} className="flex items-start gap-3">
            <span className="w-16 shrink-0 pt-1.5 text-[11px] text-fg-3">{setShortLabel(s)}</span>
            <div className="flex flex-wrap gap-1">
              {cs.map((c) => (
                <CardChip key={c} card={c} size="sm" variant={variant} prob={variant === 'possible' ? kn.cards[c].prob[player] : undefined} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <aside className="surface-raised animate-drawer h-full w-[460px] overflow-y-auto rounded-none border-y-0 border-r-0" onClick={(e) => e.stopPropagation()}>
        <div className="relative overflow-hidden px-7 pb-6 pt-7">
          <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(420px 180px at 0% 0%, rgb(${TEAM_STYLE[t].rgb} / 0.16), transparent 70%)` }} />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar name={name(player)} player={player} size={52} />
              <div>
                <div className={`text-xs ${TEAM_STYLE[t].text}`}>{TEAM_STYLE[t].name} · {teamLabel(t)} · Seat {player + 1}</div>
                <h3 className="text-display text-[34px] leading-tight text-fg">{name(player)}</h3>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <Cross />
            </Button>
          </div>
          <div className="relative mt-5 grid grid-cols-3 gap-2">
            {[
              ['In hand', pk.handCount],
              ['Located', pk.known.length],
              ['Unknown', isMe ? 0 : pk.unknownCount],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="text-display text-2xl leading-none text-fg">{v}</div>
                <div className="mt-1 text-[11px] text-fg-3">{l}</div>
              </div>
            ))}
          </div>
        </div>
        {pk.atLeastOne.length > 0 && (
          <section className="border-t border-white/[0.05] px-7 py-5">
            <h4 className="text-[13px] font-semibold text-fg">Must hold at least one of</h4>
            <p className="mb-3.5 mt-0.5 text-xs text-fg-3">They asked for a card in this set, so they held another card of it — and it hasn't moved since.</p>
            <div className="space-y-2">
              {pk.atLeastOne.map((cl, i) => (
                <div key={i} className="flex flex-wrap gap-1">
                  {cl.cards.map((c) => (
                    <CardChip key={c} card={c} size="sm" variant="possible" />
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}
        {group('Definitely holds', pk.known, 'known', 'Proven from the record.')}
        {!isMe && group('Might hold', pk.possible, 'possible', `Consistent with everything observed · small number = estimated %. ${pk.unknownCount} of these are in the hand.`)}
        {!isMe && group('Cannot hold', pk.impossible, 'impossible', 'Ruled out by failed asks, known locations or hand-size logic. Hover a card for the reason.')}
      </aside>
    </div>
  )
}
