import type { CardId, SetId } from './cards'
import { MODES, type TableSize } from '../../../shared/rules'

/** Seat index. Seats alternate teams: even seats = Team 1, odd seats = Team 2. */
export type PlayerId = number
export type TeamId = 0 | 1

/** Largest table; per-game sizes come from modeOf(setup). */
export const NUM_PLAYERS = 8

/** Table size, deck, hand size and sets for a setup (old saved games have no size → 8 players). */
export function modeOf(setup: { size?: TableSize }) {
  return MODES[setup.size ?? 8]
}

export function teamOf(p: PlayerId): TeamId {
  return (p % 2) as TeamId
}

export function teamLabel(t: TeamId): string {
  return t === 0 ? 'Team 1' : 'Team 2'
}

export function playersOfTeam(t: TeamId, n: number = NUM_PLAYERS): PlayerId[] {
  return Array.from({ length: n }, (_, p) => p).filter((p) => p % 2 === t)
}

export interface GameSetup {
  /** 6 or 8 players (default 8). 6 players adds the 8s & Jokers set and deals 9 each. */
  size?: TableSize
  players: string[] // one name per seat
  me: PlayerId
  myCards: CardId[] // my starting hand (6 cards, or 9 at a 6-player table)
  firstTurn: PlayerId
  /** Display names for [Team 1, Team 2]. */
  teamNames?: [string, string]
}

/**
 * Events are the single source of truth. The whole game state (hands, knowledge,
 * scores) is re-derived by replaying them, which makes undo exact by construction.
 */
export type GameEvent = AskEvent | DeclareEvent | FactEvent

export interface AskEvent {
  kind: 'ask'
  id: string
  ts: number
  requester: PlayerId
  target: PlayerId
  card: CardId
  success: boolean
}

/**
 * A team lays down a completed set. `holders[i]` is the player who held the i-th
 * card of the set (in cardsOfSet order) at the moment it was laid down.
 */
export interface DeclareEvent {
  kind: 'declare'
  id: string
  ts: number
  team: TeamId
  set: SetId
  holders: PlayerId[]
}

/** A directly observed fact, e.g. a card was accidentally shown. */
export interface FactEvent {
  kind: 'fact'
  id: string
  ts: number
  player: PlayerId
  card: CardId
  has: boolean
  note?: string
}

export type NewEvent =
  | Omit<AskEvent, 'id' | 'ts'>
  | Omit<DeclareEvent, 'id' | 'ts'>
  | Omit<FactEvent, 'id' | 'ts'>

/** Seat indices at this table (6 or 8). */
export function seatsOf(setup: { size?: TableSize; players?: string[] }): PlayerId[] {
  return Array.from({ length: modeOf(setup).players }, (_, p) => p)
}

/** Sets in play at this table, in display order (9 with the 8s & Jokers set at 6 players). */
export function setsOf(setup: { size?: TableSize }): SetId[] {
  return modeOf(setup).sets
}
