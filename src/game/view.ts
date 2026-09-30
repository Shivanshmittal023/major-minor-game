import { useEffect, useRef, useState } from 'react'
import { cardsOfSet, setOf, type CardId, type SetId } from '../../shared/cards'
import type { LogEntry, PublicGame, Snapshot } from '../../shared/protocol'
import { MODES, RULES, teamOfSeat, type TeamId } from '../../shared/rules'

/** Everything the game components need, derived once from the snapshot. */
export interface View {
  snap: Snapshot
  g: PublicGame
  me: number | null
  /** Players at this table (6 or 8). */
  n: number
  /** Sets in play, in display order (9 at a 6-player table). */
  sets: SetId[]
  /** Seat drawn at the bottom of the table: yours, or seat 1 for spectators. */
  viewer: number
  myTurn: boolean
  hand: CardId[]
  nameOf: (seat: number) => string
  /** Sets I can ask from, with the cards I could request in each. */
  askable: { set: SetId; have: CardId[]; want: CardId[] }[]
  canTarget: (seat: number) => boolean
}

export function makeView(snap: Snapshot): View {
  const g = snap.game!
  const me = snap.you.seat
  const sets = MODES[snap.size].sets
  const hand = [...(snap.hand ?? [])].sort((a, b) => sets.indexOf(setOf(a)) - sets.indexOf(setOf(b)) || a - b)
  const held = new Set(hand)
  const askable = sets.filter((s) => g.completed[s] === null && cardsOfSet(s).some((c) => held.has(c))).map((s) => ({
    set: s,
    have: cardsOfSet(s).filter((c) => held.has(c)),
    want: cardsOfSet(s).filter((c) => !held.has(c)),
  }))
  return {
    snap,
    g,
    n: snap.size,
    sets,
    me,
    viewer: me ?? 0,
    myTurn: snap.phase === 'playing' && me !== null && g.turn === me,
    hand,
    nameOf: (seat) => (seat === me ? 'You' : g.seats[seat]?.name ?? `Seat ${seat + 1}`),
    askable,
    canTarget: (seat) =>
      me !== null && seat !== me && g.seats[seat].cardCount > 0 && (RULES.allowTeammateAsks || teamOfSeat(seat) !== teamOfSeat(me)),
  }
}

export type Pt = { x: number; y: number }

/** Seat position on the table in %, with the viewer at the bottom, clockwise, evenly spaced for n seats. */
export function seatPos(seat: number, viewer: number, n: number, rx = 39, ry = 37): Pt & { a: number } {
  const k = (seat - viewer + n) % n
  const a = Math.PI / 2 + (k * 2 * Math.PI) / n
  return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a), a }
}

/** The viewer's team keeps its pile on the left. */
export function pilePos(team: TeamId, viewer: number): Pt {
  return { x: team === teamOfSeat(viewer) ? 33 : 67, y: 50 }
}

export const REVEAL_MS = 700 // suspense between "X asks Y for…" and the answer

export interface Flight {
  id: string
  card: CardId
  from: Pt
  to: Pt
  delay: number
}

export type BannerEntry = Extract<LogEntry, { kind: 'ask' }> | Extract<LogEntry, { kind: 'declare' }>

export interface Effects {
  /** The latest ask or declaration, shown in the centre of the table. */
  banner: BannerEntry | null
  /** Has the banner's answer been revealed yet? */
  revealed: boolean
  flights: Flight[]
  missSeat: { seat: number; key: number } | null
}

/**
 * Turns new log entries into choreography. On first render (or after a refresh)
 * nothing animates — only events that arrive while you're watching.
 */
export function useLogEffects(v: View, compact: boolean): Effects {
  const log = v.g.log
  const lastId = log.length ? log[log.length - 1].id : 0
  const seen = useRef<number | null>(null)
  const isBanner = (e: LogEntry): e is BannerEntry => e.kind === 'ask' || e.kind === 'declare'
  const latestAsk = [...log].reverse().find(isBanner)
  const [fx, setFx] = useState<Effects>({ banner: latestAsk ?? null, revealed: true, flights: [], missSeat: null })

  useEffect(() => {
    if (seen.current === null) {
      seen.current = lastId
      return
    }
    const fresh = log.filter((e) => e.id > seen.current!)
    seen.current = lastId
    if (!fresh.length) return
    const ask = [...fresh].reverse().find(isBanner)
    const rx = compact ? 40 : 39
    const ry = compact ? 38 : 37
    const flights: Flight[] = []
    if (ask?.kind === 'ask' && ask.success)
      flights.push({ id: `f${ask.id}`, card: ask.card, from: seatPos(ask.target, v.viewer, v.n, rx, ry), to: seatPos(ask.asker, v.viewer, v.n, rx, ry), delay: REVEAL_MS })
    fresh.forEach((e) => {
      // A declaration reveals the six cards; they fly from where they really were to the winning team's pile.
      if (e.kind === 'declare')
        cardsOfSet(e.set).forEach((c, i) =>
          flights.push({ id: `d${e.id}-${i}`, card: c, from: seatPos(e.actual[i], v.viewer, v.n, rx, ry), to: pilePos(e.team, v.viewer), delay: REVEAL_MS + 150 + i * 80 }),
        )
    })
    setFx({ banner: ask ?? fx.banner, revealed: !ask, flights, missSeat: null })
    const timers: number[] = []
    if (ask)
      timers.push(
        window.setTimeout(() => setFx((f) => ({ ...f, revealed: true, missSeat: ask.kind === 'ask' && !ask.success ? { seat: ask.target, key: ask.id } : null })), REVEAL_MS),
      )
    if (flights.length) timers.push(window.setTimeout(() => setFx((f) => ({ ...f, flights: [] })), Math.max(...flights.map((f) => f.delay)) + 1300))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId])

  return fx
}
