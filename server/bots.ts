import { randomInt } from 'node:crypto'
import { cardsOfSet, setOf } from '../shared/cards.js'
import { MODES, teamOfSeat } from '../shared/rules.js'
import { ask, cardCount, declare, handOf } from './game.js'
import { newPlayer, type Presence, type RoomData } from './room.js'

/**
 * Practice bots, so one person can try a full table alone.
 *
 * Bots live entirely on the server and act lazily: whenever any device polls,
 * if it's a bot's turn and the last move has had time to play out on screen,
 * that bot makes exactly one move. Asks are fair (random legal asks — no
 * peeking). To keep practice games moving, a bot declares a set only once its
 * team really holds all six, so bots never make a wrong declaration.
 */

const BOT_NAMES = ['Aria', 'Bodhi', 'Cleo', 'Dax', 'Esha', 'Finn', 'Gia', 'Hugo', 'Ivy', 'Jude']
let botDelayMs = 2500 // long enough for the ask banner, reveal and card flight

export function setBotDelay(ms: number) {
  botDelayMs = ms
}

const pick = <T,>(xs: T[]): T => xs[randomInt(xs.length)]

/** Seat a new bot in every empty seat. Returns how many were added. */
export function fillWithBots(r: RoomData, now: number): number {
  let added = 0
  const taken = new Set(r.players.map((p) => p.name.toLowerCase()))
  r.seating = r.seating.map((id) => {
    if (id) return id
    const name = BOT_NAMES.find((n) => !taken.has(n.toLowerCase())) ?? `Bot ${r.players.length + 1}`
    taken.add(name.toLowerCase())
    const p = { ...newPlayer(name, now), bot: true as const }
    r.players.push(p)
    added++
    return p.id
  })
  return added
}

/** Bots are always online. */
export function withBots(r: RoomData, presence: Presence, now: number): Presence {
  const out = { ...presence }
  for (const p of r.players) if (p.bot) out[p.id] = now
  return out
}

/** Is a bot due to move? (Cheap check, no mutation.) */
export function botDue(r: RoomData, now: number): boolean {
  const g = r.game
  if (!g || r.phase !== 'playing' || g.winner !== null) return false
  const p = r.players.find((x) => x.id === r.seating[g.turn])
  if (!p?.bot) return false
  const last = g.log[g.log.length - 1]
  return now - (last?.t ?? 0) >= botDelayMs
}

/** Make one bot move. Returns true if the room changed. */
export function botStep(r: RoomData, now: number): boolean {
  if (!botDue(r, now)) return false
  const g = r.game!
  const seat = g.turn
  const team = teamOfSeat(seat)

  // Declare any set the bot's team fully holds.
  for (const s of MODES[g.size].sets) {
    if (g.completed[s] !== null) continue
    const owners = cardsOfSet(s).map((c) => g.owner[c])
    if (owners.every((o) => o >= 0 && teamOfSeat(o) === team)) {
      declare(g, seat, s, owners)
      if (g.winner !== null) r.phase = 'finished'
      return true
    }
  }

  const hand = handOf(g, seat)
  const opps = Array.from({ length: g.size }, (_, s) => s).filter((s) => teamOfSeat(s) !== team && cardCount(g, s) > 0)
  if (!hand.length || !opps.length) return false
  const set = setOf(pick(hand))
  const want = cardsOfSet(set).filter((c) => g.owner[c] !== seat)
  ask(g, seat, pick(opps), pick(want))
  if (g.winner !== null) r.phase = 'finished'
  return true
}
