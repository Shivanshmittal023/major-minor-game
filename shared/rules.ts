import { EXTRA_SET, SET_DISPLAY_ORDER, type SetId } from './cards.js'

/**
 * The house rules of Major–Minor, fixed for every table. They live in one place
 * so the rest of the code never hard-codes turn behaviour: the server engine
 * reads RULES, and the lobby shows it.
 */

export type SeatRef = 'asker' | 'target' | 'next'

export interface TurnPolicy {
  /** Who moves after the asked player HAD the card. */
  afterSuccess: SeatRef
  /** Who moves after the asked player did NOT have the card. */
  afterFailure: SeatRef
}

export interface GameConfig {
  turn: TurnPolicy
  /** May a player ask their own teammate? */
  allowTeammateAsks: boolean
  /** Seat index (0–7) that moves first, or 'random'. */
  firstTurn: number | 'random'
}

export const RULES: GameConfig = {
  turn: { afterSuccess: 'asker', afterFailure: 'target' }, // hit: ask again · miss: the asked player plays
  allowTeammateAsks: false, // opponents only
  firstTurn: 'random',
}

/** Human-readable summary shown in the lobby. */
export const RULES_SUMMARY: { label: string; detail: string }[] = [
  { label: 'After a successful ask', detail: 'The asker goes again.' },
  { label: 'After a failed ask', detail: 'The asked player plays next.' },
  { label: 'Who can be asked', detail: 'Only players on the other team.' },
  { label: 'First turn', detail: 'A random player starts.' },
  { label: 'Asking', detail: 'You must hold a card of a set to ask for another card of it.' },
  { label: 'Declaring', detail: 'Any time, name which teammate holds each card of a set. Right: your team wins it. Wrong: the opponents do.' },
  { label: 'Winning', detail: 'Declared sets leave play. Most sets wins; 4–4 is a draw.' },
]

// ---------------------------------------------------------------- table sizes

/**
 * Two table sizes. 8 players is the classic game; 6 players adds a 9th set
 * (8♠ 8♥ 8♦ 8♣ + two Jokers). Everything else — asking, declaring, turns,
 * scoring — is identical. Seats always alternate teams.
 */
export type TableSize = 6 | 8

export interface Mode {
  players: TableSize
  /** Cards in play: ids 0..cards-1. */
  cards: number
  handSize: number
  /** Sets in play, in display order. */
  sets: SetId[]
  title: string
  detail: string
}

export const MODES: Record<TableSize, Mode> = {
  8: { players: 8, cards: 48, handSize: 6, sets: [...SET_DISPLAY_ORDER], title: '8 players', detail: '4 v 4 · 48 cards · 8 sets · 6 each' },
  6: { players: 6, cards: 54, handSize: 9, sets: [...SET_DISPLAY_ORDER, EXTRA_SET], title: '6 players', detail: '3 v 3 · 54 cards · 9 sets · 9 each' },
}

export const DEFAULT_SIZE: TableSize = 8

/** Team names are editable in the lobby; these are the defaults. */
export const DEFAULT_TEAM_NAMES: readonly [string, string] = ['Tide', 'Ember']
export const TEAM_NAME_MAX = 16

export function isTableSize(x: unknown): x is TableSize {
  return x === 6 || x === 8
}

/** Largest table, for sizing arrays that must fit any mode. */
export const MAX_SEATS = 8

export type TeamId = 0 | 1

/** Seats alternate teams: even seats are Team 1, odd seats Team 2 (T1 → T2 → T1 → …). */
export function teamOfSeat(seat: number): TeamId {
  return (seat % 2) as TeamId
}

export function teamLabel(t: TeamId): string {
  return t === 0 ? 'Team 1' : 'Team 2'
}
