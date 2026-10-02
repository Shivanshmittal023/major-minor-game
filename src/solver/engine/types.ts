import type { CardId, SetId } from './cards'

/** Seat index 0..7. Seats alternate teams: even seats = Team 1, odd seats = Team 2. */
export type PlayerId = number
export type TeamId = 0 | 1

export const NUM_PLAYERS = 8
export const HAND_SIZE = 6

export function teamOf(p: PlayerId): TeamId {
  return (p % 2) as TeamId
}

export function teamLabel(t: TeamId): string {
  return t === 0 ? 'Team 1' : 'Team 2'
}

export function playersOfTeam(t: TeamId): PlayerId[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].filter((p) => p % 2 === t)
}

export interface GameSetup {
  players: string[] // 8 names, index = seat
  me: PlayerId
  myCards: CardId[] // my 6 starting cards
  /** Most tables only allow asking opponents. Leave false unless your table plays otherwise. */
  allowTeammateAsks: boolean
  firstTurn: PlayerId
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
