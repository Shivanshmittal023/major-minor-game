import { createContext, useContext } from 'react'
import type { GameState } from '../engine/game'
import type { GameApi } from '../state/useGame'

export interface Ctx {
  api: GameApi
  state: GameState
  /** Display name, "You" for me. */
  name: (p: number) => string
  hoverCard: (card: number | null, el?: HTMLElement | null) => void
  inspectPlayer: (p: number | null) => void
  /** Take a completed set off the table: records it directly when every holder is known, otherwise opens the lay-down form. */
  layDown: (set: number) => void
  /** Pending request for the composer to open a specific form (bumped nonce = new request). */
  composerRequest: { mode: 'declare'; set: number; nonce: number } | null
}

export const GameContext = createContext<Ctx | null>(null)

export function useCtx(): Ctx {
  const c = useContext(GameContext)
  if (!c) throw new Error('GameContext missing')
  return c
}

/**
 * Team identity: Tide (cool) vs Ember (warm). Used for dots, seat accents, card
 * backs and ownership tints — never for large fills.
 */
export const TEAM_STYLE = [
  {
    name: 'Tide', hex: '#86aaf0', rgb: '134 170 240',
    dot: 'bg-tide', text: 'text-tide', soft: 'bg-tide/10', bar: 'bg-tide', border: 'border-tide/35', ring: 'ring-tide/60', back: '#27375a',
  },
  {
    name: 'Ember', hex: '#e79a5c', rgb: '231 154 92',
    dot: 'bg-ember', text: 'text-ember', soft: 'bg-ember/10', bar: 'bg-ember', border: 'border-ember/35', ring: 'ring-ember/60', back: '#503421',
  },
] as const
