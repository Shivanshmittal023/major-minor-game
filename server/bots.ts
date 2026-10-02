import { chooseMove } from './ai/brain.js'
import { ask, cardCount, declare, handOf } from './game.js'
import { newPlayer, type Presence, type RoomData } from './room.js'

/**
 * Bots, so one person can play a full table alone.
 *
 * Bots live on the server and act lazily: whenever any device polls, if it's a
 * bot's turn and the last move has had time to play out on screen, that bot
 * makes one move. Moves come from ai/brain.ts — the Solver's deduction run from
 * the bot's seat using only its own hand and public events (no peeking).
 */

const BOT_NAMES = ['Aria', 'Bodhi', 'Cleo', 'Dax', 'Esha', 'Finn', 'Gia', 'Hugo', 'Ivy', 'Jude']
let botDelayMs = 15_000 // one bot move every 15 seconds, so people can follow and remember the asks

export function setBotDelay(ms: number) {
  botDelayMs = ms
}

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

/** Make one bot move — chosen by the deduction brain from public information only. */
export function botStep(r: RoomData, now: number): boolean {
  if (!botDue(r, now)) return false
  const g = r.game!
  const seat = g.turn
  const move = chooseMove({
    size: g.size,
    me: seat,
    hand: handOf(g, seat),
    log: g.log,
    cardCounts: Array.from({ length: g.size }, (_, p) => cardCount(g, p)),
    completed: g.completed,
  })
  if (!move) return false
  if (move.kind === 'declare') declare(g, seat, move.set, move.holders)
  else ask(g, seat, move.target, move.card)
  if (g.winner !== null) r.phase = 'finished'
  return true
}
