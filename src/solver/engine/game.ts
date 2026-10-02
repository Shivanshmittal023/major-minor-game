import { buildProblem, type BuiltProblem } from './constraints'
import { EventError, replay, type Timeline } from './history'
import { deriveKnowledge, type Knowledge } from './knowledge'
import { recommendMoves, type Recommendation } from './recommend'
import { analyze, type AnalyzeOptions, type Analysis } from './solver'
import type { GameEvent, GameSetup, NewEvent } from './types'

/**
 * Engine entry point. The pipeline is:
 *   events --replay--> timeline --buildProblem--> CSP --analyze--> exact domains + samples
 *          --deriveKnowledge--> what's known / possible / impossible --recommendMoves--> suggestions
 * Each stage is a pure function, so any one of them can be swapped for a smarter version.
 */

export interface GameState {
  setup: GameSetup
  events: GameEvent[]
  timeline: Timeline
  built: BuiltProblem
  analysis: Analysis
  knowledge: Knowledge
  recommendation: Recommendation
}

export type ComputeResult = { ok: true; state: GameState } | { ok: false; error: string; eventIndex: number }

export function computeState(setup: GameSetup, events: GameEvent[], opts: AnalyzeOptions = {}): ComputeResult {
  let timeline: Timeline
  try {
    timeline = replay(setup, events)
  } catch (e) {
    if (e instanceof EventError) return { ok: false, error: e.message, eventIndex: e.eventIndex }
    throw e
  }
  const built = buildProblem(setup, events, timeline)
  if (built.contradiction) return { ok: false, error: built.contradiction.message, eventIndex: built.contradiction.eventIndex }
  const analysis = analyze(built.problem, { seed: 7919 * (events.length + 1), ...opts })
  if (!analysis.feasible) {
    return {
      ok: false,
      error: 'This contradicts earlier observations — no possible deal of the cards is consistent with everything recorded.',
      eventIndex: events.length - 1,
    }
  }
  const knowledge = deriveKnowledge(setup, timeline, built, analysis)
  const recommendation = recommendMoves(setup, events, timeline, knowledge)
  return { ok: true, state: { setup, events, timeline, built, analysis, knowledge, recommendation } }
}

let counter = 0
export function makeEvent(ev: NewEvent): GameEvent {
  counter++
  return { ...ev, id: `${Date.now().toString(36)}-${counter}`, ts: Date.now() } as GameEvent
}

/** Validate + apply a new event. On failure nothing changes and the reason is returned. */
export function tryAddEvent(setup: GameSetup, events: GameEvent[], ev: NewEvent, opts?: AnalyzeOptions): ComputeResult {
  return computeState(setup, [...events, makeEvent(ev)], opts)
}
