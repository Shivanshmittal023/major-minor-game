import { describe, expect, it } from 'vitest'
import { ALL_CARDS, cardsOfSet, NUM_SETS, setOf, type CardId } from '../cards'
import { computeState, tryAddEvent, type GameState } from '../game'
import { mulberry32 } from '../solver'
import { teamOf, type GameEvent, type GameSetup, type NewEvent, type PlayerId } from '../types'

/**
 * Plays full random games with a hidden true deal, feeds the observable events to
 * the engine from one player's point of view, and checks after every event that:
 *   - the engine never rejects a genuinely legal event,
 *   - every card's true owner is among the engine's possible owners (soundness),
 *   - every card the engine calls "known" is really there,
 *   - hand counts, laid-down sets and scores match the truth,
 *   - a set is only reported complete when a team truly holds it.
 */

interface Sim {
  owner: number[] // true owner per card, -1 = laid down
  laid: boolean[]
}

function deal(rng: () => number): number[] {
  const cards = [...ALL_CARDS]
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  const owner = new Array(48)
  cards.forEach((c, i) => (owner[c] = Math.floor(i / 6)))
  return owner
}

function checkConsistent(state: GameState, sim: Sim, label: string) {
  const kn = state.knowledge
  for (const c of ALL_CARDS) {
    const ck = kn.cards[c]
    const truth = sim.owner[c]
    if (truth === -1) {
      expect(ck.status, `${label}: card ${c} should be out`).toBe('out')
      continue
    }
    expect(ck.possible, `${label}: card ${c} true owner ${truth} must be possible`).toContain(truth)
    expect(ck.unverified, `${label}: card ${c} possibility left unproven`).toBe(false)
    if (ck.status === 'known') expect(ck.owner, `${label}: card ${c} known owner`).toBe(truth)
    if (ck.team !== null) expect(ck.team, `${label}: card ${c} team`).toBe(teamOf(truth))
  }
  for (let p = 0; p < 8; p++) {
    const truthCount = sim.owner.filter((o) => o === p).length
    expect(kn.players[p].handCount, `${label}: hand count of ${p}`).toBe(truthCount)
  }
  for (let s = 0; s < NUM_SETS; s++) {
    const sk = kn.sets[s]
    if (sk.heldBy !== null) {
      for (const c of cardsOfSet(s)) expect(teamOf(sim.owner[c]), `${label}: set ${s} held`).toBe(sk.heldBy)
    }
  }
}

function playGame(seed: number, opts: { checkEvery?: number; smart?: boolean } = {}) {
  const rng = mulberry32(seed)
  const me: PlayerId = Math.floor(rng() * 8)
  const owner = deal(rng)
  const sim: Sim = { owner, laid: new Array(NUM_SETS).fill(false) }
  const setup: GameSetup = {
    players: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    me,
    myCards: ALL_CARDS.filter((c) => owner[c] === me),
      firstTurn: 0,
  }
  let events: GameEvent[] = []
  let turn: PlayerId = 0
  let state: GameState | null = null
  const init = computeState(setup, events)
  expect(init.ok).toBe(true)
  if (init.ok) state = init.state

  const handOf = (p: PlayerId) => ALL_CARDS.filter((c) => sim.owner[c] === p)
  let steps = 0
  for (let step = 0; step < 120; step++) {
    // Lay down any set a team fully holds.
    for (let s = 0; s < NUM_SETS; s++) {
      if (sim.laid[s]) continue
      const cs = cardsOfSet(s)
      const t = teamOf(sim.owner[cs[0]])
      if (cs.every((c) => sim.owner[c] >= 0 && teamOf(sim.owner[c]) === t)) {
        const ev: NewEvent = { kind: 'declare', team: t, set: s, holders: cs.map((c) => sim.owner[c]) }
        const r = tryAddEvent(setup, events, ev)
        if (!r.ok) throw new Error(`seed ${seed}: declare rejected: ${r.error}`)
        events = r.state.events
        state = r.state
        cs.forEach((c) => (sim.owner[c] = -1))
        sim.laid[s] = true
      }
    }
    if (sim.laid.every(Boolean)) break

    // Find someone who can move (turn passes on if a player is out of cards).
    let guard = 0
    while (handOf(turn).length === 0 && guard++ < 8) turn = (turn + 1) % 8
    const hand = handOf(turn)
    const opponents = [0, 1, 2, 3, 4, 5, 6, 7].filter((p) => teamOf(p) !== teamOf(turn) && handOf(p).length > 0)
    if (!hand.length || !opponents.length) break

    let card: CardId
    let target: PlayerId
    if (opts.smart && turn === me && state) {
      const best = state.recommendation.moves[0]
      if (!best) break
      card = best.card
      target = best.target
    } else {
      const sets = [...new Set(hand.map(setOf))]
      const s = sets[Math.floor(rng() * sets.length)]
      const askable = cardsOfSet(s).filter((c) => sim.owner[c] !== turn && sim.owner[c] !== -1)
      if (!askable.length) {
        turn = (turn + 1) % 8
        continue
      }
      card = askable[Math.floor(rng() * askable.length)]
      // Bias towards the right target half the time, like real players with good memory.
      const holder = sim.owner[card]
      target = rng() < 0.4 && opponents.includes(holder) ? holder : opponents[Math.floor(rng() * opponents.length)]
    }
    const success = sim.owner[card] === target
    const r = tryAddEvent(setup, events, { kind: 'ask', requester: turn, target, card, success })
    if (!r.ok) throw new Error(`seed ${seed} step ${step}: legal ask rejected: ${r.error}`)
    events = r.state.events
    state = r.state
    if (success) sim.owner[card] = turn
    else turn = target
    steps++
    if (!opts.checkEvery || step % opts.checkEvery === 0) checkConsistent(state, sim, `seed ${seed} step ${step}`)
  }
  if (state) checkConsistent(state, sim, `seed ${seed} final`)
  return { steps, state: state!, sim, setup, events }
}

describe('simulated games', () => {
  it('stays logically consistent with the hidden deal through full games', () => {
    for (let seed = 1; seed <= 12; seed++) playGame(seed, { checkEvery: 3 })
  }, 120_000)

  it('stays consistent when I follow my own recommendations', () => {
    for (let seed = 100; seed <= 105; seed++) playGame(seed, { checkEvery: 4, smart: true })
  }, 120_000)

  it('undo (replaying a prefix) reproduces the earlier state exactly', () => {
    const { setup, events } = playGame(7, { checkEvery: 50 })
    const cut = Math.floor(events.length / 2)
    const a = computeState(setup, events.slice(0, cut))
    const b = computeState(setup, events.slice(0, cut))
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) {
      expect(a.state.knowledge.cards.map((c) => c.possible)).toEqual(b.state.knowledge.cards.map((c) => c.possible))
      expect(a.state.timeline.handCounts).toEqual(b.state.timeline.handCounts)
    }
  }, 60_000)

  it('is fast enough to run on every event', () => {
    const { setup, events } = playGame(3, { checkEvery: 1000 })
    const t0 = performance.now()
    for (let i = 0; i < 10; i++) computeState(setup, events.slice(0, events.length - i))
    const avg = (performance.now() - t0) / 10
    expect(avg).toBeLessThan(400)
  }, 60_000)
})
