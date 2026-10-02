import { describe, expect, it } from 'vitest'
import { cardsOfSet, setOf } from '../../shared/cards.js'
import { RULES, teamOfSeat, type TableSize } from '../../shared/rules.js'
import { chooseMove, infer, type BotView } from '../ai/brain.js'
import { ask, cardCount, declare, handOf, newGame, type Game } from '../game.js'

function seeded(seed: number) {
  let a = seed >>> 0
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { f, int: (n: number) => Math.floor(f() * n) }
}

const view = (g: Game, seat: number): BotView => ({
  size: g.size,
  me: seat,
  hand: handOf(g, seat),
  log: g.log,
  cardCounts: Array.from({ length: g.size }, (_, p) => cardCount(g, p)),
  completed: g.completed,
})

/** A weak player: random legal ask; declares only what it can see in its own hand… plus team truth to finish games. */
function randomMove(g: Game, seat: number, rng: ReturnType<typeof seeded>) {
  const team = teamOfSeat(seat)
  for (let s = 0; s < g.completed.length; s++) {
    if (g.completed[s] !== null) continue
    const owners = cardsOfSet(s).map((c) => g.owner[c])
    if (owners.includes(seat) && owners.every((o) => o >= 0 && teamOfSeat(o) === team)) return declare(g, seat, s, owners)
  }
  const hand = handOf(g, seat)
  const opps = Array.from({ length: g.size }, (_, p) => p).filter((p) => teamOfSeat(p) !== team && cardCount(g, p) > 0)
  if (!hand.length || !opps.length) return
  const set = setOf(hand[rng.int(hand.length)])
  const want = cardsOfSet(set).filter((c) => g.owner[c] !== seat)
  ask(g, seat, opps[rng.int(opps.length)], want[rng.int(want.length)])
}

function play(size: TableSize, seed: number, smart: (seat: number) => boolean, check?: (g: Game) => void) {
  const rng = seeded(seed)
  const g = newGame(size, RULES, (n) => rng.int(n))
  for (let step = 0; step < 4000 && g.winner === null; step++) {
    const seat = g.turn
    if (smart(seat)) {
      const m = chooseMove(view(g, seat), rng.f)
      if (!m) break
      if (m.kind === 'declare') declare(g, seat, m.set, m.holders)
      else ask(g, seat, m.target, m.card)
    } else randomMove(g, seat, rng)
    check?.(g)
  }
  return g
}

describe('bot brain', () => {
  it('deductions are always sound: the true holder is always possible, and "proven" is always right', () => {
    for (const size of [8, 6] as const) {
      for (let seed = 1; seed <= 3; seed++) {
        let checks = 0
        play(size, seed, () => false, (g) => {
          if (g.log.length % 9 !== 0 || g.winner !== null) return
          for (let seat = 0; seat < g.size; seat++) {
            const b = infer(view(g, seat), seed)
            for (let c = 0; c < g.owner.length; c++) {
              const truth = g.owner[c]
              if (truth < 0) continue
              expect(b.possible[c]).toContain(truth)
              if (b.owner[c] !== null) expect(b.owner[c]).toBe(truth)
            }
          }
          checks++
        })
        expect(checks).toBeGreaterThan(2)
      }
    }
  }, 120_000)

  it.each([8, 6] as const)('beats random players decisively at a %i-player table', (size) => {
    let wins = 0
    const games = 6
    for (let seed = 1; seed <= games; seed++) {
      const g = play(size, 100 + seed, (seat) => teamOfSeat(seat) === 0)
      expect(g.winner).not.toBeNull()
      if (g.winner === 0) wins++
    }
    expect(wins).toBeGreaterThanOrEqual(games - 1)
  }, 240_000)

  it('brain vs brain games always finish with only legal moves', () => {
    for (const size of [8, 6] as const) {
      const g = play(size, 7, () => true)
      expect(g.winner).not.toBeNull()
      expect(g.completed.every((t) => t !== null)).toBe(true)
    }
  }, 240_000)
})
