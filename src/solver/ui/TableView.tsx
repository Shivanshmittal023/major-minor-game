import { useEffect, useRef, useState } from 'react'
import { cardLabel, cardsOfSet, EXTRA_SET, setLabel, setOf, setShortLabel, type CardId } from '../engine/cards'
import { isRedSet, setGlyph, setKind, setKindShort } from '../engine/cards'
import { teamLabel, teamOf, type PlayerId, type TeamId, seatsOf, setsOf } from '../engine/types'
import { canAsk } from './asks'
import { CardBack, CardChip } from './CardChip'
import { TEAM_STYLE, teamName, useCtx } from './context'
import { describeEvent, pct } from './format'
import { Avatar, Badge, Button, Check, Cross, TeamDot, useNewKeys } from './kit'

// ---------------------------------------------------------------------------
// The live table — where turns are recorded, by tapping players
// ---------------------------------------------------------------------------

/** What tapping a seat does, and how it looks, given who is asking. */
type SeatRole = 'asker' | 'target' | 'bench' | 'idle'

function useSeats() {
  const { state, asker, pickAsker, recordAsk, inspectPlayer } = useCtx()
  const role = (p: PlayerId): SeatRole =>
    p === asker ? 'asker' : canAsk(state, asker, p) ? 'target' : teamOf(p) === teamOf(asker) ? 'bench' : 'idle'
  /** Opponent of the asker → record the ask; anyone else with cards → they become the asker; the asker → details. */
  const tap = (p: PlayerId) => {
    const r = role(p)
    if (r === 'target') recordAsk(p)
    else if (r === 'asker' || state.timeline.handCounts[p] === 0) inspectPlayer(p)
    else pickAsker(p)
  }
  return { role, tap }
}

export function TablePanel() {
  const { state, name, asker, pickAsker, openTool } = useCtx()
  const { setup, timeline: tl, knowledge: kn } = state
  const known = kn.cards.filter((c) => c.status === 'known').length
  const offTurn = asker !== tl.nextTurn
  return (
    <section className="surface relative overflow-hidden rounded-2xl">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 pb-1 pt-4 sm:px-6">
        <div className="min-w-0 text-[13px] text-fg-2">
          <span className="text-fg">{asker === setup.me ? 'You are' : `${name(asker)} is`} asking</span>
          <span className="text-fg-3"> · tap the opponent {asker === setup.me ? 'you' : 'they'} asked</span>
          {offTurn && (
            <button type="button" onClick={() => pickAsker(null)} className="ml-2 text-xs text-champagne underline-offset-2 hover:underline">
              back to {name(tl.nextTurn)}
            </button>
          )}
        </div>
        <div className="hidden items-baseline gap-1.5 text-xs text-fg-4 sm:flex">
          <span className="text-display text-lg leading-none text-fg-2">{known}</span> of {kn.cards.length} cards located
        </div>
      </header>

      <div className="lg:hidden">
        <PhoneTable />
      </div>
      <div className="hidden lg:block">
        <TableScene />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.05] px-3 py-2.5 sm:px-5">
        <Button size="sm" variant="ghost" onClick={() => openTool('declare')}>
          Lay down a set
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openTool('fact')}>
          Observation
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openTool('ask')}>
          <span className="sm:hidden">Manual</span>
          <span className="hidden sm:inline">Manual entry</span>
        </Button>
        <span className="ml-auto hidden text-[11px] text-fg-4 md:inline">Tap a teammate to change who's asking · ⓘ for details</span>
      </div>
    </section>
  )
}

function seatPos(p: PlayerId, me: PlayerId, n: number, rx = 38, ry = 37) {
  // Me at the bottom centre, then clockwise in seat order.
  const k = (p - me + n) % n
  const a = Math.PI / 2 + (k * 2 * Math.PI) / n
  return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a), a }
}

type Pt = { x: number; y: number }
type Flight = { id: string; card: CardId; from: Pt; to: Pt; delay: number }

/** Card movement: a transfer flies seat → seat; a lay-down sends all six cards to `pile(team)`. */
function useFlights(pos: (p: PlayerId) => Pt, pile: (t: TeamId) => Pt): Flight[] {
  const { state } = useCtx()
  const { events } = state
  const lastEv = events[events.length - 1]
  const [flights, setFlights] = useState<Flight[]>([])
  const prevLen = useRef(events.length)
  const posRef = useRef({ pos, pile })
  posRef.current = { pos, pile }
  useEffect(() => {
    const grew = events.length === prevLen.current + 1
    prevLen.current = events.length
    if (!grew || !lastEv) return
    const { pos, pile } = posRef.current
    let next: Flight[] = []
    if (lastEv.kind === 'ask' && lastEv.success) next = [{ id: lastEv.id, card: lastEv.card, from: pos(lastEv.target), to: pos(lastEv.requester), delay: 0 }]
    else if (lastEv.kind === 'declare')
      next = cardsOfSet(lastEv.set).map((c, i) => ({ id: `${lastEv.id}-${i}`, card: c, from: pos(lastEv.holders[i]), to: pile(lastEv.team), delay: i * 70 }))
    if (!next.length) return
    setFlights(next)
    const t = setTimeout(() => setFlights([]), 1300 + next.length * 70)
    return () => clearTimeout(t)
  }, [events.length, lastEv])
  return flights
}

function Flights({ flights, size }: { flights: Flight[]; size: 'sm' | 'lg' }) {
  return (
    <>
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
          <CardChip card={f.card} size={size} variant="known" inspect={false} className="shadow-[0_20px_40px_-10px_rgba(0,0,0,0.9)]" />
        </div>
      ))}
    </>
  )
}

/** The middle of the table: turn, last event, and sets ready to lay down. */
function Centre({ compact }: { compact: boolean }) {
  const { state, name, layDown } = useCtx()
  const { setup, timeline: tl, events, knowledge: kn } = state
  const lastEv = events[events.length - 1]
  const last = lastEv ? describeEvent(setup, lastEv) : null
  const ready = setsOf(setup).filter((s) => kn.sets[s].heldBy !== null && kn.sets[s].laidDownBy === null)
  return (
    <div className="flex flex-col items-center text-center">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-fg-4">Turn {events.length + 1}</div>
      <div className={`mt-0.5 flex items-center gap-1.5 ${compact ? 'text-[13px]' : 'text-display text-[26px] leading-tight'}`}>
        {tl.nextTurn === setup.me ? <span className="text-champagne">Your move</span> : <span className="text-fg">{name(tl.nextTurn)} to play</span>}
      </div>
      {last && (
        <div key={lastEv!.id} className={`animate-rise mt-1.5 line-clamp-2 max-w-[300px] leading-snug ${compact ? 'text-[11px]' : 'text-xs'} ${last.ok === false ? 'text-rose' : last.ok ? 'text-sage' : 'text-fg-3'}`}>
          {last.title} · {last.result}
        </div>
      )}
      {ready.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => layDown(s)}
          className="animate-rise mt-2 inline-flex h-7 items-center gap-1.5 rounded-full border border-champagne/40 bg-champagne/[0.1] px-3 text-[11px] font-medium text-champagne transition-colors hover:bg-champagne/[0.18]"
        >
          <TeamDot team={kn.sets[s].heldBy!} /> Lay down {compact ? setShortLabel(s) : setLabel(s)}
        </button>
      ))}
    </div>
  )
}

const FELT = {
  background: 'radial-gradient(ellipse at 50% 30%, #1b2130 0%, #11141c 55%, #0b0d12 100%)',
  boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.07), inset 0 -30px 60px rgb(0 0 0 / 0.45), 0 30px 80px -30px rgb(0 0 0 / 0.9)',
}

/** Small tag under a seat saying what tapping it does. */
function RoleTag({ role, self }: { role: SeatRole; self: boolean }) {
  if (role === 'asker') return <span className="rounded-full bg-champagne px-2 text-[10px] font-semibold leading-4 text-ink-900">{self ? 'You ask' : 'Asking'}</span>
  if (role === 'target') return <span className="rounded-full border border-champagne/45 bg-champagne/[0.08] px-2 text-[10px] font-medium leading-4 text-champagne">Ask</span>
  return null
}

function PhoneTable() {
  const { state, name } = useCtx()
  const { setup, timeline: tl, events, knowledge: kn } = state
  const n = setup.players.length
  const pos = (p: PlayerId) => seatPos(p, setup.me, n, 40, 40)
  const flights = useFlights(pos, () => ({ x: 50, y: 50 }))
  const { role, tap } = useSeats()
  const lastEv = events[events.length - 1]
  const missId = lastEv?.kind === 'ask' && !lastEv.success ? lastEv.id : null

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px]">
      <div className="absolute inset-[21%] rounded-[50%]" style={FELT} />
      <div className="absolute inset-[21%] flex items-center justify-center px-3">
        <Centre compact />
      </div>
      {seatsOf(setup).map((p) => {
        const { x, y } = pos(p)
        const r = role(p)
        const out = tl.handCounts[p] === 0
        return (
          <button
            key={p}
            type="button"
            onClick={() => tap(p)}
            aria-label={r === 'target' ? `Record an ask of ${name(p)}` : r === 'asker' ? `Details for ${name(p)}` : `${name(p)} asks`}
            className={`absolute flex w-[76px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 py-1 transition-opacity duration-300 ${r === 'bench' || out ? 'opacity-40' : ''}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="relative">
              {lastEv?.kind === 'ask' && lastEv.target === p && missId && <span key={missId} className="animate-ripple pointer-events-none absolute inset-0 rounded-full" />}
              <Avatar name={name(p)} player={p} size={42} active={r === 'asker'} />
              <span className="text-display absolute -bottom-1 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full border border-white/10 bg-ink-900 px-1 text-[13px] leading-none text-fg">
                {kn.players[p].handCount}
              </span>
            </span>
            <span className="mt-1 max-w-full truncate text-[11px] font-medium text-fg">{name(p)}</span>
            <RoleTag role={r} self={p === setup.me} />
          </button>
        )
      })}
      <Flights flights={flights} size="sm" />
    </div>
  )
}

/** Where each team's pile of completed sets sits, in scene %. Your team's pile is on the left. */
function pilePos(team: TeamId, myTeam: TeamId): Pt {
  return { x: team === myTeam ? 33 : 67, y: 50 }
}

function TableScene() {
  const { state } = useCtx()
  const { setup, events } = state
  const myTeam = teamOf(setup.me)
  const n = setup.players.length
  const flights = useFlights((p) => seatPos(p, setup.me, n), (t) => pilePos(t, myTeam))
  const { role, tap } = useSeats()
  const lastEv = events[events.length - 1]
  const missId = lastEv?.kind === 'ask' && !lastEv.success ? lastEv.id : null

  return (
    <div className="relative h-[620px] overflow-hidden">
      <div className="absolute left-1/2 top-1/2 h-[40%] w-[48%] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute inset-0 rounded-[50%]" style={FELT} />
        <div className="absolute inset-[14px] rounded-[50%] border border-white/[0.045]" />
        {([myTeam, (1 - myTeam) as TeamId]).map((t) => (
          <Pile key={t} team={t} side={t === myTeam ? 'left' : 'right'} />
        ))}
        <div className="absolute inset-0 flex items-center justify-center px-[24%]">
          <Centre compact={false} />
        </div>
      </div>

      {seatsOf(setup).map((p) => {
        const { x, y } = seatPos(p, setup.me, n)
        return (
          <div key={p} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <Seat p={p} role={role(p)} onTap={() => tap(p)} missId={lastEv?.kind === 'ask' && lastEv.target === p ? missId : null} />
          </div>
        )
      })}

      <Flights flights={flights} size="lg" />
    </div>
  )
}

/** A team's completed sets, stacked face down inside the table — out of play. */
function Pile({ team, side }: { team: TeamId; side: 'left' | 'right' }) {
  const { state } = useCtx()
  const sets = setsOf(state.setup).filter((s) => state.knowledge.sets[s].laidDownBy === team)
  const fresh = useNewKeys(sets)
  const st = TEAM_STYLE[team]
  if (!sets.length) return null
  return (
    <div className={`absolute top-1/2 flex w-[110px] -translate-y-1/2 flex-col gap-1.5 ${side === 'left' ? 'left-[6%] items-start' : 'right-[6%] items-end'}`}>
      <div className={`flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] ${st.text} opacity-80`}>
        <TeamDot team={team} size={5} /> {teamName(team)} · {sets.length}
      </div>
      <div className={`flex flex-wrap gap-1.5 ${side === 'right' ? 'justify-end' : ''}`}>
        {sets.map((s) => {
          const red = isRedSet(s)
          return (
            <span key={s} className={`relative h-[38px] w-[30px] ${fresh.has(s) ? 'animate-reveal' : ''}`} style={fresh.has(s) ? { animationDelay: '700ms' } : undefined} title={`${setLabel(s)} · laid down by ${teamName(team)}`}>
              <CardBack team={team} className="absolute inset-0 h-full w-full -translate-x-[3px] translate-y-px rotate-[-11deg]" />
              <span className={`paper absolute inset-0 flex flex-col items-center justify-center rounded-[4px] leading-none ${red ? 'text-crimson' : 'text-inkcard'}`}>
                <span className="text-sm">{setGlyph(s)}</span>
                <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide opacity-70">{setKindShort(s)}</span>
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** A desktop seat: name, count and hand. Tap to record/choose the asker; ⓘ for everything known about them. */
function Seat({ p, role, onTap, missId }: { p: PlayerId; role: SeatRole; onTap: () => void; missId: string | null }) {
  const { state, name, inspectPlayer } = useCtx()
  const { setup, knowledge: kn } = state
  const pk = kn.players[p]
  const t = teamOf(p)
  const fresh = useNewKeys(pk.known)
  const out = pk.handCount === 0

  return (
    <div className={`relative transition-opacity duration-300 ${role === 'bench' || out ? 'opacity-40 hover:opacity-100' : ''}`}>
      <button
        type="button"
        onClick={onTap}
        className={`surface-raised group relative block w-[190px] rounded-xl p-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 ${
          role === 'asker' ? 'border-champagne/60 shadow-[0_0_0_1px_rgba(230,210,162,0.35)]' : role === 'target' ? 'hover:border-champagne/45' : 'hover:border-white/15'
        }`}
      >
        <span className="absolute inset-x-3 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${TEAM_STYLE[t].hex}, transparent)`, opacity: 0.7 }} />
        {missId && <span key={missId} className="animate-ripple pointer-events-none absolute inset-0 rounded-xl" />}
        <div className="flex items-center gap-2">
          <Avatar name={name(p)} player={p} size={28} active={role === 'asker'} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{name(p)}</span>
          <span className="text-display text-[22px] leading-none text-fg">{pk.handCount}</span>
        </div>
        <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1">
          {pk.known.map((c) => (
            <CardChip key={c} card={c} size="xs" variant="known" fresh={fresh.has(c)} />
          ))}
          {Array.from({ length: Math.max(0, pk.unknownCount) }).map((_, i) => (
            <CardBack key={i} team={t} className="h-6 w-[14px]" />
          ))}
          {out && <span className="text-[11px] text-fg-4">Out of cards</span>}
        </div>
      </button>
      <button
        type="button"
        onClick={() => inspectPlayer(p)}
        aria-label={`Details for ${name(p)}`}
        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-ink-900 text-[12px] text-fg-3 shadow-md transition-colors hover:border-champagne/40 hover:text-champagne"
        style={{ display: p === setup.me ? 'none' : undefined }}
      >
        ⓘ
      </button>
      {role !== 'idle' && role !== 'bench' && (
        <span className="pointer-events-none absolute -bottom-2.5 left-1/2 -translate-x-1/2">
          <RoleTag role={role} self={p === setup.me} />
        </span>
      )}
    </div>
  )
}

/** Expected cards per set for the hidden part of a hand, as paired minor/major bars per suit. */
function Affinity({ p }: { p: PlayerId }) {
  const { state } = useCtx()
  const pk = state.knowledge.players[p]
  const known = new Map<number, number>()
  pk.known.forEach((c) => known.set(setOf(c), (known.get(setOf(c)) ?? 0) + 1))
  return (
    <div className="flex items-end justify-between">
      {[[0, 4], [1, 5], [2, 6], [3, 7], ...(setsOf(state.setup).includes(EXTRA_SET) ? [[EXTRA_SET]] : [])].map((group) => (
        <div key={group[0]} className="flex items-end gap-1">
          <span className={`text-[11px] leading-none ${isRedSet(group[0]) ? 'text-rose/70' : 'text-fg-3'}`}>{setGlyph(group[0])}</span>
          {group.map((s) => {
            const e = Math.max(0, pk.expectedBySet[s] - (known.get(s) ?? 0))
            const h = Math.min(1, e / 2.2)
            const laid = state.knowledge.sets[s].laidDownBy !== null
            return (
              <span key={s} className="relative h-5 w-[7px] overflow-hidden rounded-[2px] bg-white/[0.06]" title={`${setShortLabel(s)} · ~${e.toFixed(1)} hidden card${e >= 0.95 && e < 1.05 ? '' : 's'}`}>
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

export function Roster() {
  const { state, name, inspectPlayer } = useCtx()
  const { setup, knowledge: kn, timeline: tl } = state
  const order = seatsOf(state.setup).sort((a, b) => teamOf(a) - teamOf(b) || a - b)
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
                className={`cursor-pointer border-t align-middle transition-colors hover:bg-white/[0.025] ${i === order.length / 2 ? 'border-white/10' : 'border-white/[0.04]'}`}
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
  const order = seatsOf(state.setup).sort((a, b) => teamOf(a) - teamOf(b) || a - b)
  const half = order.length / 2
  return (
    <div>
      <div className="max-h-[660px] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-ink-850/95 backdrop-blur-sm">
            <tr className="border-b border-white/[0.06]">
              <th className="px-6 py-2.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-fg-4">Card</th>
              {order.map((p, i) => (
                <th key={p} className={`px-1 py-2.5 font-medium text-fg-2 ${i === half ? 'border-l border-white/10' : ''}`}>
                  <span className="inline-flex items-center gap-1.5"><TeamDot player={p} />{name(p)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {setsOf(state.setup).map((s) => kn.sets[s].laidDownBy !== null ? [
              <tr key={`h${s}`}>
                <td colSpan={order.length + 1} className="border-t border-white/[0.05] px-6 py-2 text-[11px] text-fg-4">
                  <span className="inline-flex items-center gap-2">
                    <span className={isRedSet(s) ? 'text-rose/60' : 'text-fg-3'}>{setGlyph(s)}</span>
                    <span className="text-fg-3">{setKind(s)}</span>
                    <span>· off the table, laid down by</span>
                    <span className={TEAM_STYLE[kn.sets[s].laidDownBy!].text}>{teamLabel(kn.sets[s].laidDownBy!)}</span>
                  </span>
                </td>
              </tr>,
            ] : [
              <tr key={`h${s}`}>
                <td colSpan={order.length + 1} className="border-t border-white/[0.05] bg-white/[0.015] px-6 py-1.5 text-[11px] text-fg-3">
                  <span className={isRedSet(s) ? 'text-rose' : 'text-fg-2'}>{setGlyph(s)}</span> {setKind(s)}
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
                      const sep = i === half ? 'border-l border-white/10' : ''
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
  const bySet = (cards: CardId[]) => setsOf(state.setup).map((s) => ({ s, cs: cards.filter((c) => setOf(c) === s) })).filter((g) => g.cs.length)

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
      <aside className="surface-raised animate-drawer h-full w-full max-w-[460px] overflow-y-auto rounded-none border-y-0 border-r-0" onClick={(e) => e.stopPropagation()}>
        <div className="relative overflow-hidden px-7 pb-6 pt-7">
          <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(420px 180px at 0% 0%, rgb(${TEAM_STYLE[t].rgb} / 0.16), transparent 70%)` }} />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar name={name(player)} player={player} size={52} />
              <div>
                <div className={`text-xs ${TEAM_STYLE[t].text}`}>{teamName(t)} · Seat {player + 1}</div>
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
        {!isMe && pk.unknownCount > 0 && (
          <section className="border-t border-white/[0.05] px-7 py-5">
            <h4 className="mb-3 text-[13px] font-semibold text-fg">Likely sets in the hidden cards</h4>
            <Affinity p={player} />
          </section>
        )}
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
