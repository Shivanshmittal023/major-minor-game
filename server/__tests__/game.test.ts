import { describe, expect, it } from 'vitest'
import { cardLabel, cardsOfSet, EXTRA_SET, JOKER_COLOURFUL, JOKER_COLOURLESS, NUM_CARDS, parseCard, setOf } from '../../shared/cards.js'
import { RULES, teamOfSeat, type GameConfig } from '../../shared/rules.js'
import { ask, cardCount, declare, handOf, newGame, OUT, RuleError, skipTurn, validateAsk, type Game } from '../game.js'

const c = (s: string) => parseCard(s)!

/** Deterministic rng for reproducible deals. */
function seeded(seed: number) {
  let a = seed >>> 0
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
  }
}

/** Build a game with a hand-picked deal: owners[seat] = cards. */
function rigged(hands: string[][], config: Partial<GameConfig> = {}): Game {
  const g = newGame(8, { ...RULES, firstTurn: 0, ...config }, seeded(1))
  g.owner.fill(-2)
  hands.forEach((h, seat) => h.forEach((x) => (g.owner[c(x)] = seat)))
  // Deal the remaining cards round-robin to keep 48 in play.
  let s = 0
  for (let i = 0; i < NUM_CARDS; i++) if (g.owner[i] === -2) g.owner[i] = s++ % 8
  g.completed.fill(null)
  g.log = []
  g.winner = null
  g.turn = 0
  return g
}

describe('dealing', () => {
  it('deals 48 cards, 6 each, no 8s', () => {
    const g = newGame(8, RULES, seeded(7))
    for (let s = 0; s < 8; s++) expect(cardCount(g, s) + g.completed.filter((t) => t !== null).length * 0).toBeLessThanOrEqual(6)
    const total = [...g.owner].filter((o) => o >= 0).length + g.completed.filter((t) => t !== null).length * 6
    expect(total).toBe(48)
    // The 8-player deck is exactly cards 0–47: no 8s, no Jokers.
    expect(g.owner.length).toBe(48)
    expect(g.completed.length).toBe(8)
    for (let s = 0; s < 8; s++) expect(cardCount(g, s)).toBe(6)
  })
  it('respects a fixed first turn', () => {
    expect(newGame(8, { ...RULES, firstTurn: 5 }, seeded(3)).turn).toBe(5)
  })
})

describe('asking', () => {
  it('transfers the card on success and follows the configured turn policy', () => {
    const g = rigged([['3s'], ['6s']], { turn: { afterSuccess: 'asker', afterFailure: 'target' } })
    const e = ask(g, 0, 1, c('6s'))
    expect(e.kind === 'ask' && e.success).toBe(true)
    expect(g.owner[c('6s')]).toBe(0)
    expect(g.turn).toBe(0)
  })

  it('passes the turn as configured on failure', () => {
    const g = rigged([['3s'], ['9h'], [], [], [], ['6s']], { turn: { afterSuccess: 'asker', afterFailure: 'target' } })
    ask(g, 0, 1, c('6s'))
    expect(g.turn).toBe(1)
    const g2 = rigged([['3s'], ['9h'], [], [], [], ['6s']], { turn: { afterSuccess: 'asker', afterFailure: 'next' } })
    ask(g2, 0, 3, c('6s'))
    expect(g2.turn).toBe(1)
  })

  it('enforces every legality rule', () => {
    const g = rigged([['3s', '6s'], ['9h'], ['2s']])
    const bad = (a: number, t: number, card: string) => expect(() => validateAsk(g, a, t, c(card))).toThrow(RuleError)
    bad(1, 0, '9h') // not your turn
    bad(0, 0, '2s') // yourself
    bad(0, 2, '2s') // teammate (seat 2 is also Team 1)
    bad(0, 1, '6s') // already hold it
    bad(0, 1, 'kh') // no Major Hearts card
    expect(() => validateAsk(g, 0, 1, c('2s'))).not.toThrow()
    const g2 = rigged([['3s', '6s'], ['9h'], ['2s']], { allowTeammateAsks: true })
    expect(() => validateAsk(g2, 0, 2, c('2s'))).not.toThrow()
  })

  it('does not complete a set on its own — holding all six just waits for a declaration', () => {
    const g = rigged([['2s', '3s'], ['7s'], ['4s'], [], ['5s'], [], ['6s']])
    ask(g, 0, 1, c('7s'))
    expect(g.completed[setOf(c('2s'))]).toBeNull()
    expect(g.owner[c('7s')]).toBe(0)
  })

  it('skips players with no cards and lets the host skip an absent player', () => {
    const g = rigged([['3s'], ['6s']], { turn: { afterSuccess: 'target', afterFailure: 'target' } })
    // Give seat 1 exactly one card, then take it: seat 1 is empty and must be skipped.
    for (let x = 0; x < NUM_CARDS; x++) if (g.owner[x] === 1 && x !== c('6s')) g.owner[x] = 3
    ask(g, 0, 1, c('6s'))
    expect(cardCount(g, 1)).toBe(0)
    expect(g.turn).toBe(2)
    expect(g.log.some((e) => e.kind === 'skip' && e.reason === 'no-cards')).toBe(true)
    skipTurn(g)
    expect(g.turn).toBe(3)
  })
})

describe('full random games', () => {
  it.each([8, 6] as const)('always terminate with a consistent winner (%i players)', (size) => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seeded(seed)
      const g = newGame(size, RULES, rng)
      const total = size === 8 ? 48 : 54
      const nSets = size === 8 ? 8 : 9
      let steps = 0
      while (g.winner === null && steps++ < 5000) {
        // Any player may declare at any time: declare every set a team fully holds (correctly).
        for (let set = 0; set < nSets && g.winner === null; set++) {
          if (g.completed[set] !== null) continue
          const owners = cardsOfSet(set).map((x) => g.owner[x])
          if (owners.every((o) => teamOfSeat(o) === teamOfSeat(owners[0]))) declare(g, owners[0], set, owners)
        }
        if (g.winner !== null) break
        const me = g.turn
        const hand = handOf(g, me)
        const sets = [...new Set(hand.map(setOf))]
        const set = sets[rng(sets.length)]
        const wanted = cardsOfSet(set).filter((x) => g.owner[x] !== me)
        const opps = Array.from({ length: size }, (_, s) => s).filter((s) => teamOfSeat(s) !== teamOfSeat(me) && cardCount(g, s) > 0)
        if (!opps.length) continue // nobody to ask: the declarations above will finish the game
        const card = wanted[rng(wanted.length)]
        // Half the time ask the right person, to move the game along.
        const target = rng(2) && opps.includes(g.owner[card]) ? g.owner[card] : opps[rng(opps.length)]
        ask(g, me, target, card)
        const inPlay = [...g.owner].filter((o) => o >= 0).length
        expect(inPlay + g.completed.filter((t) => t !== null).length * 6).toBe(total)
      }
      expect(g.winner).not.toBeNull()
      expect(g.completed).toHaveLength(nSets)
      expect(g.completed.every((t) => t !== null)).toBe(true)
      const end = g.log[g.log.length - 1]
      expect(end.kind).toBe('end')
    }
  })
})

describe('house rules', () => {
  it('are the fixed table rules', async () => {
    const { RULES } = await import('../../shared/rules.js')
    expect(RULES).toEqual({ turn: { afterSuccess: 'asker', afterFailure: 'target' }, allowTeammateAsks: false, firstTurn: 'random' })
  })
  it('a real table plays them: hit → ask again, miss → asked player, teammates refused', () => {
    const g = newGame()
    const me = g.turn
    const hand = handOf(g, me)
    const set = setOf(hand[0])
    const want = cardsOfSet(set).find((x) => g.owner[x] !== me)!
    const holder = g.owner[want]
    const teammate = (me + 2) % 8
    expect(() => validateAsk(g, me, teammate, want)).toThrow(/other team/)
    if (teamOfSeat(holder) !== teamOfSeat(me)) {
      ask(g, me, holder, want)
      expect(g.turn).toBe(me)
    } else {
      const opp = (me + 1) % 8
      ask(g, me, opp, want)
      expect(g.turn).toBe(opp)
    }
  })
  it('deals randomly — first player and hands vary between games', () => {
    const firsts = new Set<number>()
    const hands = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const g = newGame()
      firsts.add(g.turn)
      hands.add(handOf(g, 0).join(','))
    }
    expect(firsts.size).toBeGreaterThan(3)
    expect(hands.size).toBe(40)
  })
})

describe('declaring', () => {
  const minorSpadesWithTeam1 = () => rigged([['2s', '3s'], [], ['4s'], [], ['5s', '6s'], [], ['7s']])

  it('a correct declaration wins the set for the declarer’s team; cards leave play; turn unchanged', () => {
    const g = minorSpadesWithTeam1()
    g.turn = 3 // someone else's turn: declaring works any time
    const e = declare(g, 2, 0, [0, 0, 2, 4, 4, 6])
    expect(e.kind === 'declare' && e.correct).toBe(true)
    expect(g.completed[0]).toBe(0)
    for (const x of cardsOfSet(0)) expect(g.owner[x]).toBe(OUT)
    expect(g.turn).toBe(3)
  })

  it('a wrong holder hands the set to the opponents and reveals where cards really were', () => {
    const g = minorSpadesWithTeam1()
    const e = declare(g, 0, 0, [0, 0, 2, 4, 6, 6]) // 6♠ is with seat 4, not 6
    expect(e.kind === 'declare' && !e.correct && e.team === 1).toBe(true)
    expect(e.kind === 'declare' && e.actual).toEqual([0, 0, 2, 4, 4, 6])
    expect(g.completed[0]).toBe(1)
  })

  it('declaring a set the opponents partly hold is wrong too', () => {
    const g = rigged([['2s', '3s'], ['4s'], [], [], ['5s', '6s'], [], ['7s']])
    declare(g, 0, 0, [0, 0, 2, 4, 4, 6])
    expect(g.completed[0]).toBe(1)
  })

  it('rejects holders outside your team, incomplete claims and already-won sets', () => {
    const g = minorSpadesWithTeam1()
    expect(() => declare(g, 0, 0, [0, 0, 1, 4, 4, 6])).toThrow(/your team/)
    expect(() => declare(g, 0, 0, [0, 0, 2])).toThrow(/all six/)
    declare(g, 0, 0, [0, 0, 2, 4, 4, 6])
    expect(() => declare(g, 0, 0, [0, 0, 2, 4, 4, 6])).toThrow(/already been won/)
  })

  it('moves the turn on if the player to move just lost their last cards to a declaration', () => {
    const g = rigged([['2s', '3s'], [], ['4s'], [], ['5s', '6s'], [], ['7s']])
    for (let x = 0; x < 48; x++) if (g.owner[x] === 6 && x !== c('7s')) g.owner[x] = 1
    g.turn = 6
    declare(g, 0, 0, [0, 0, 2, 4, 4, 6])
    expect(cardCount(g, 6)).toBe(0)
    expect(g.turn).toBe(7)
  })
})

describe('6-player mode', () => {
  it('deals 54 cards — 9 each — including the 8s and both Jokers, over 9 sets', () => {
    const g = newGame(6, RULES, seeded(11))
    expect(g.owner.length).toBe(54)
    expect(g.completed.length).toBe(9)
    for (let s = 0; s < 6; s++) expect(cardCount(g, s)).toBe(9)
    const extras = cardsOfSet(EXTRA_SET).map(cardLabel)
    expect(extras).toEqual(['8♠', '8♥', '8♦', '8♣', 'Colourful Joker', 'Colourless Joker'])
    for (const c of cardsOfSet(EXTRA_SET)) expect(g.owner[c]).toBeGreaterThanOrEqual(0)
    expect(parseCard('8s')).toBe(48)
  })

  it('seats alternate 3 v 3 and only 6 seats exist', () => {
    const g = newGame(6, { ...RULES, firstTurn: 0 }, seeded(2))
    expect([0, 1, 2, 3, 4, 5].map(teamOfSeat)).toEqual([0, 1, 0, 1, 0, 1])
    const hand = handOf(g, 0)
    const want = cardsOfSet(setOf(hand[0])).find((x) => g.owner[x] !== 0)!
    expect(() => validateAsk(g, 0, 7, want)).toThrow(/Unknown player/)
  })

  it('asking and declaring work for the 8s & Jokers set', () => {
    const g = newGame(6, { ...RULES, firstTurn: 0 }, seeded(5))
    // Put the whole extra set with Team 1 (seats 0, 2, 4) to test a correct declaration.
    const extra = cardsOfSet(EXTRA_SET)
    const holders = [0, 0, 2, 2, 4, 4]
    extra.forEach((c, i) => {
      const displaced = g.owner.findIndex((o, x) => o === holders[i] && !extra.includes(x))
      g.owner[displaced] = g.owner[c] // swap to keep hand sizes intact
      g.owner[c] = holders[i]
    })
    expect(() => validateAsk(g, 0, 1, extra[0])).toThrow(/already hold/) // seat 0 holds 8♠
    expect(() => validateAsk(g, 0, 1, JOKER_COLOURFUL)).not.toThrow() // holding 8♠ lets you ask for a Joker
    const e = declare(g, 4, EXTRA_SET, holders)
    expect(e.kind === 'declare' && e.correct).toBe(true)
    expect(g.completed[EXTRA_SET]).toBe(0)
  })

  it('an 8-player table rejects the extra set entirely', () => {
    const g = newGame(8, RULES, seeded(9))
    expect(() => declare(g, 0, EXTRA_SET, [0, 0, 0, 0, 0, 0])).toThrow(/Unknown set/)
    expect(() => validateAsk(g, g.turn, (g.turn + 1) % 8, JOKER_COLOURLESS)).toThrow(/Unknown card/)
  })
})
