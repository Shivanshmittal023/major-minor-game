import { describe, expect, it } from 'vitest'
import { cardsOfSet, EXTRA_SET, setOf, type CardId } from '../cards'
import { computeState, tryAddEvent, type GameState } from '../game'
import { mulberry32 } from '../solver'
import { teamOf, type GameEvent, type GameSetup, type NewEvent, type PlayerId } from '../types'

/**
 * The Solver at a 6-player table: 54 cards (with the 8s & Jokers set), 9 each.
 * Plays random games against a hidden deal and checks every deduction stays true.
 */
function play(seed: number) {
  const rng = mulberry32(seed)
  const n = 54
  const deck = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const owner: number[] = new Array(n)
  deck.forEach((c, i) => (owner[c] = Math.floor(i / 9)))
  const me: PlayerId = Math.floor(rng() * 6)
  const setup: GameSetup = { size: 6, players: ['A', 'B', 'C', 'D', 'E', 'F'], me, myCards: deck.filter((c) => owner[c] === me), firstTurn: 0 }
  let events: GameEvent[] = []
  let state = (computeState(setup, events) as { ok: true; state: GameState }).state
  const laid = new Array(9).fill(false)
  const handOf = (p: number) => deck.filter((c) => owner[c] === p)
  let turn = 0
  for (let step = 0; step < 150; step++) {
    for (let s = 0; s < 9; s++) {
      if (laid[s]) continue
      const cs = cardsOfSet(s)
      const t = teamOf(owner[cs[0]])
      if (cs.every((c) => owner[c] >= 0 && teamOf(owner[c]) === t)) {
        const r = tryAddEvent(setup, events, { kind: 'declare', team: t, set: s, holders: cs.map((c) => owner[c]) } as NewEvent)
        if (!r.ok) throw new Error(`declare rejected: ${r.error}`)
        events = r.state.events
        state = r.state
        cs.forEach((c) => (owner[c] = -1))
        laid[s] = true
      }
    }
    if (laid.every(Boolean)) break
    let g = 0
    while (handOf(turn).length === 0 && g++ < 6) turn = (turn + 1) % 6
    const hand = handOf(turn)
    const opps = [0, 1, 2, 3, 4, 5].filter((p) => teamOf(p) !== teamOf(turn) && handOf(p).length > 0)
    if (!hand.length || !opps.length) break
    const set = setOf(hand[Math.floor(rng() * hand.length)])
    const want = cardsOfSet(set).filter((c) => owner[c] !== turn && owner[c] !== -1)
    if (!want.length) {
      turn = (turn + 1) % 6
      continue
    }
    const card: CardId = want[Math.floor(rng() * want.length)]
    const target = rng() < 0.4 && opps.includes(owner[card]) ? owner[card] : opps[Math.floor(rng() * opps.length)]
    const success = owner[card] === target
    const r = tryAddEvent(setup, events, { kind: 'ask', requester: turn, target, card, success })
    if (!r.ok) throw new Error(`legal ask rejected: ${r.error}`)
    events = r.state.events
    state = r.state
    if (success) owner[card] = turn
    else turn = target
    if (step % 4 === 0)
      for (let c = 0; c < n; c++) {
        const ck = state.knowledge.cards[c]
        if (owner[c] === -1) expect(ck.status).toBe('out')
        else {
          expect(ck.possible).toContain(owner[c])
          if (ck.status === 'known') expect(ck.owner).toBe(owner[c])
        }
      }
  }
  return state
}

describe('Solver at a 6-player table', () => {
  it('knows the 8s & Jokers set and deals 9 each', () => {
    const s = play(1)
    expect(s.knowledge.sets).toHaveLength(9)
    expect(s.knowledge.cards).toHaveLength(54)
    expect(cardsOfSet(EXTRA_SET)).toEqual([48, 49, 50, 51, 52, 53])
  })
  it('stays consistent with the hidden deal across full random games', () => {
    for (let seed = 2; seed <= 6; seed++) play(seed)
  }, 120_000)
})
