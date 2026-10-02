import { randomInt } from 'node:crypto'
import { cardLabel, cardsOfSet, setLabel, setOf, type CardId } from '../shared/cards.js'
import type { LogEntry } from '../shared/protocol.js'
import { DEFAULT_SIZE, MODES, RULES, teamOfSeat, type GameConfig, type SeatRef, type TableSize, type TeamId } from '../shared/rules.js'

/**
 * Authoritative Major–Minor game state. Pure data + functions, no I/O, so the
 * whole rules engine is unit-testable. Only the server ever holds this object.
 */

export const OUT = -1

export interface Game {
  /** 6 or 8 players. Decides the deck (48 or 54 cards), hand size and sets in play. */
  size: TableSize
  config: GameConfig
  /** Current owner seat of every card, or OUT once its set is completed. (Plain array: rooms are stored as JSON.) */
  owner: number[]
  turn: number
  completed: (TeamId | null)[]
  log: LogEntry[]
  winner: TeamId | 'draw' | null
  nextLogId: number
}

export class RuleError extends Error {}

export type Rng = (maxExclusive: number) => number
const cryptoRng: Rng = (n) => randomInt(n)

/** Tables always play RULES; the config parameter exists so tests can exercise the engine in isolation. */
export function newGame(size: TableSize = DEFAULT_SIZE, config: GameConfig = RULES, rng: Rng = cryptoRng): Game {
  const mode = MODES[size]
  // Fisher–Yates over the mode's deck: cards 0–47 (8 players) or 0–53 incl. 8s & Jokers (6 players).
  const deck = Array.from({ length: mode.cards }, (_, i) => i)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng(i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const owner: number[] = new Array(mode.cards).fill(0)
  deck.forEach((c, i) => (owner[c] = Math.floor(i / mode.handSize)))
  const first = config.firstTurn === 'random' ? rng(size) : config.firstTurn
  // completed[] is indexed by set id: 8 slots at an 8-player table, 9 at a 6-player table.
  const g: Game = { size, config, owner, turn: first, completed: new Array(Math.max(...mode.sets) + 1).fill(null), log: [], winner: null, nextLogId: 1 }
  push(g, { kind: 'start', first })
  return g
}

function push(g: Game, e: DistributiveOmit<LogEntry, 'id' | 't'>) {
  g.log.push({ ...e, id: g.nextLogId++, t: Date.now() } as LogEntry)
}
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

export function handOf(g: Game, seat: number): CardId[] {
  const out: CardId[] = []
  for (let c = 0; c < g.owner.length; c++) if (g.owner[c] === seat) out.push(c)
  return out
}

export function cardCount(g: Game, seat: number): number {
  let n = 0
  for (let c = 0; c < g.owner.length; c++) if (g.owner[c] === seat) n++
  return n
}

export function score(g: Game): [number, number] {
  const s: [number, number] = [0, 0]
  g.completed.forEach((t) => t !== null && s[t]++)
  return s
}

/** Throws RuleError with a player-facing message if the ask is illegal. */
export function validateAsk(g: Game, asker: number, target: number, card: CardId) {
  if (g.winner !== null) throw new RuleError('The game is over.')
  if (asker !== g.turn) throw new RuleError("It's not your turn.")
  if (!Number.isInteger(target) || target < 0 || target >= g.size) throw new RuleError('Unknown player.')
  if (target === asker) throw new RuleError("You can't ask yourself.")
  if (!Number.isInteger(card) || card < 0 || card >= g.owner.length) throw new RuleError('Unknown card.')
  if (!g.config.allowTeammateAsks && teamOfSeat(target) === teamOfSeat(asker)) throw new RuleError('You can only ask players on the other team.')
  const set = setOf(card)
  if (g.completed[set] !== null) throw new RuleError(`${setLabel(set)} is already complete.`)
  if (g.owner[card] === asker) throw new RuleError(`You already hold ${cardLabel(card)}.`)
  if (!cardsOfSet(set).some((c) => g.owner[c] === asker)) throw new RuleError(`You need a ${setLabel(set)} card to ask for ${cardLabel(card)}.`)
  if (cardCount(g, target) === 0) throw new RuleError('That player has no cards.')
}

export function ask(g: Game, asker: number, target: number, card: CardId): LogEntry {
  validateAsk(g, asker, target, card)
  const success = g.owner[card] === target
  if (success) g.owner[card] = asker
  const next = nextTurn(g, success ? g.config.turn.afterSuccess : g.config.turn.afterFailure, asker, target)
  push(g, { kind: 'ask', asker, target, card, success, next })
  const entry = g.log[g.log.length - 1]
  setTurn(g, next)
  return entry
}

function nextTurn(g: Game, ref: SeatRef, asker: number, target: number): number {
  if (ref === 'asker') return asker
  if (ref === 'target') return target
  return (asker + 1) % g.size
}

/**
 * The spec doesn't say what happens when the player due to move has no cards.
 * A player without cards cannot make any ask, so the turn moves clockwise to the
 * next player who still holds cards. Recorded publicly as a 'skip'.
 */
function setTurn(g: Game, seat: number) {
  let s = seat
  for (let i = 0; i < g.size && cardCount(g, s) === 0; i++) s = (s + 1) % g.size
  if (s !== seat) push(g, { kind: 'skip', from: seat, to: s, reason: 'no-cards' })
  g.turn = s
}

/** Skip the turn of someone who has left or disconnected — by any player, or automatically after a minute ('away'). */
export function skipTurn(g: Game, reason: 'player' | 'away' = 'player'): void {
  if (g.winner !== null) throw new RuleError('The game is over.')
  const from = g.turn
  let to = (from + 1) % g.size
  for (let i = 0; i < g.size && cardCount(g, to) === 0; i++) to = (to + 1) % g.size
  push(g, { kind: 'skip', from, to, reason })
  g.turn = to
}

/**
 * Declaring a set: any seated player holding at least one of its cards, at any time, names which teammate holds
 * each of the six cards (holders[i] is the seat for cardsOfSet(set)[i]).
 *   · every card exactly where claimed → the declarer's team wins the set
 *   · anything wrong (wrong teammate, or a card with the opponents) → the opponents win it
 * Either way the six cards are revealed and leave play, and the turn stays where it
 * was (moving on only if that player has just run out of cards).
 */
export function declare(g: Game, declarer: number, set: number, holders: number[]): LogEntry {
  if (g.winner !== null) throw new RuleError('The game is over.')
  if (!Number.isInteger(set) || !MODES[g.size].sets.includes(set)) throw new RuleError('Unknown set.')
  if (g.completed[set] !== null) throw new RuleError(`${setLabel(set)} has already been won.`)
  // House rule: you may only declare a set you currently hold at least one card of.
  if (!cardsOfSet(set).some((c) => g.owner[c] === declarer)) throw new RuleError(`You can only declare a set you hold a card of — you have no ${setLabel(set)} cards.`)
  const team = teamOfSeat(declarer)
  if (!Array.isArray(holders) || holders.length !== 6) throw new RuleError('Name a holder for all six cards.')
  if (holders.some((h) => !Number.isInteger(h) || h < 0 || h >= g.size || teamOfSeat(h) !== team)) throw new RuleError('Every card must be assigned to a player on your team.')
  const cards = cardsOfSet(set)
  const actual = cards.map((c) => g.owner[c])
  const correct = actual.every((o, i) => o === holders[i])
  const winner: TeamId = correct ? team : ((1 - team) as TeamId)
  cards.forEach((c) => (g.owner[c] = OUT))
  g.completed[set] = winner
  push(g, { kind: 'declare', declarer, set, claimed: [...holders], actual, correct, team: winner })
  const entry = g.log[g.log.length - 1]
  if (!checkEnd(g)) setTurn(g, g.turn)
  return entry
}

/** The game ends once every set in play (8, or 9 at a 6-player table) has been declared. */
function checkEnd(g: Game): boolean {
  if (!MODES[g.size].sets.every((s) => g.completed[s] !== null)) return false
  const [a, b] = score(g)
  g.winner = a === b ? 'draw' : a > b ? 0 : 1
  push(g, { kind: 'end', winner: g.winner, score: [a, b] })
  return true
}
