import type { CardId, SetId } from './cards.js'
import type { TableSize, TeamId } from './rules.js'

/**
 * API contract (see server/handler.ts). The server answers every device with a
 * tailored snapshot: the public room/game state plus ONLY that device's own
 * hand. No response ever contains another player's cards.
 */

// ---------------------------------------------------------------- client → server

export type ClientMsg =
  | { type: 'create'; name: string; size: TableSize }
  | { type: 'join'; code: string; name: string }
  | { type: 'seat'; playerId: string; seat: number | null }
  | { type: 'autoSeat' }
  | { type: 'shuffleSeats' }
  | { type: 'swapTeams' }
  | { type: 'kick'; playerId: string }
  | { type: 'fillBots' }
  | { type: 'teamName'; team: TeamId; name: string }
  | { type: 'start' }
  | { type: 'ask'; target: number; card: CardId; actionId: string }
  | { type: 'declare'; set: SetId; holders: number[]; actionId: string }
  | { type: 'skipTurn' }
  | { type: 'backToLobby' }
  | { type: 'leave' }

// ---------------------------------------------------------------- server → client

export type Phase = 'lobby' | 'playing' | 'finished'

export interface PlayerView {
  id: string
  name: string
  connected: boolean
  isHost: boolean
  seat: number | null
  /** A practice bot. */
  bot: boolean
}

export type LogEntry =
  | { id: number; t: number; kind: 'start'; first: number }
  | { id: number; t: number; kind: 'ask'; asker: number; target: number; card: CardId; success: boolean; next: number }
  /** claimed/actual: seat per card of the set (as named, and where each really was). `team` won the set. */
  | { id: number; t: number; kind: 'declare'; declarer: number; set: SetId; claimed: number[]; actual: number[]; correct: boolean; team: TeamId }
  | { id: number; t: number; kind: 'skip'; from: number; to: number; reason: 'no-cards' | 'host' }
  | { id: number; t: number; kind: 'end'; winner: TeamId | 'draw'; score: [number, number] }

export interface SeatView {
  seat: number
  playerId: string
  name: string
  team: TeamId
  cardCount: number
  connected: boolean
  bot: boolean
}

export interface PublicGame {
  seats: SeatView[]
  turn: number
  /** Per set: team that completed it (cards are then out of play), or null. */
  completed: (TeamId | null)[]
  score: [number, number]
  /**
   * Only the last few public events — enough to animate what just happened.
   * The full history never leaves the server: players are meant to remember it.
   */
  recent: LogEntry[]
  /** Asks made so far (drives the turn counter). */
  askCount: number
  winner: TeamId | 'draw' | null
}

export interface Snapshot {
  code: string
  /** 6 or 8 players — fixed when the table is created. */
  size: TableSize
  /** [Team 1, Team 2] display names. */
  teamNames: [string, string]
  phase: Phase
  version: number
  you: { id: string; name: string; isHost: boolean; seat: number | null }
  players: PlayerView[]
  seating: (string | null)[] // playerId per seat
  game: PublicGame | null
  /** Private: your own hand only. Null when you're not seated in a running game. */
  hand: CardId[] | null
}

export const MAX_LOBBY = 16
export const NAME_MAX = 20
export const CODE_LENGTH = 6
