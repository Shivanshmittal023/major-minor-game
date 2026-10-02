import { describe, expect, it } from 'vitest'
import { cardLabel, cardsOfSet, parseCard, setOf } from '../cards'
import { computeState, makeEvent, tryAddEvent, type GameState } from '../game'
import { validateSetup } from '../history'
import type { GameEvent, GameSetup, NewEvent } from '../types'

const c = (s: string) => {
  const x = parseCard(s)
  if (x === null) throw new Error('bad card ' + s)
  return x
}

// Seats: 0 Me(T1) 1 Rahul(T2) 2 Amit(T1) 3 Meera(T2) 4 Priya(T1) 5 Dev(T2) 6 Sara(T1) 7 Kiran(T2)
const setup: GameSetup = {
  players: ['Me', 'Rahul', 'Amit', 'Meera', 'Priya', 'Dev', 'Sara', 'Kiran'],
  me: 0,
  myCards: ['3s', '5s', 'qh', '9d', '2c', 'ac'].map(c),
  firstTurn: 0,
}

function play(evs: NewEvent[]): GameState {
  let events: GameEvent[] = []
  let last: GameState | null = null
  for (const e of evs) {
    const r = tryAddEvent(setup, events, e)
    if (!r.ok) throw new Error(r.error)
    events = r.state.events
    last = r.state
  }
  if (!last) {
    const r = computeState(setup, [])
    if (!r.ok) throw new Error(r.error)
    last = r.state
  }
  return last
}

describe('cards', () => {
  it('parses shorthand (8s exist only for 6-player tables)', () => {
    expect(cardLabel(c('6s'))).toBe('6♠')
    expect(cardLabel(c('10h'))).toBe('10♥')
    expect(cardLabel(c('th'))).toBe('10♥')
    expect(cardLabel(c('QD'))).toBe('Q♦')
    expect(parseCard('8s')).toBe(48)
    expect(parseCard('1s')).toBeNull()
    expect(parseCard('zz')).toBeNull()
  })
  it('has 8 sets of 6 with correct membership', () => {
    expect(cardsOfSet(0).map(cardLabel)).toEqual(['2♠', '3♠', '4♠', '5♠', '6♠', '7♠'])
    expect(cardsOfSet(5).map(cardLabel)).toEqual(['9♥', '10♥', 'J♥', 'Q♥', 'K♥', 'A♥'])
  })
})

describe('setup validation', () => {
  it('requires exactly 6 unique cards and names', () => {
    expect(validateSetup(setup)).toEqual([])
    expect(validateSetup({ ...setup, myCards: setup.myCards.slice(0, 5) })).not.toEqual([])
    expect(validateSetup({ ...setup, myCards: [...setup.myCards.slice(0, 5), setup.myCards[0]] })).not.toEqual([])
    expect(validateSetup({ ...setup, players: [...setup.players.slice(0, 7), ''] })).not.toEqual([])
    expect(validateSetup({ ...setup, players: [...setup.players.slice(0, 7), 'me'] })).not.toEqual([])
  })
})

describe('inference', () => {
  it('initially knows only my cards', () => {
    const s = play([])
    const kn = s.knowledge
    expect(kn.players[0].known.length).toBe(6)
    expect(kn.cards[c('6s')].possible).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(kn.cards[c('3s')].owner).toBe(0)
  })

  it('failed ask: card is with neither asker nor target; asker holds the set', () => {
    const s = play([{ kind: 'ask', requester: 1, target: 2, card: c('6s'), success: false }])
    const ck = s.knowledge.cards[c('6s')]
    expect(ck.possible).not.toContain(1)
    expect(ck.possible).not.toContain(2)
    expect(ck.ruledOut.find((r) => r.player === 2)?.event).toBe(0)
    // Rahul holds at least one Minor ♠ card other than 6♠ (and not my 3♠/5♠).
    const clause = s.knowledge.players[1].atLeastOne[0]
    expect(clause.cards.map(cardLabel).sort()).toEqual(['2♠', '4♠', '7♠'])
  })

  it('successful transfer moves the card and hand counts', () => {
    const s = play([
      { kind: 'ask', requester: 1, target: 2, card: c('6s'), success: false },
      { kind: 'ask', requester: 2, target: 3, card: c('6s'), success: true },
    ])
    expect(s.knowledge.cards[c('6s')].owner).toBe(2)
    expect(s.timeline.handCounts[2]).toBe(7)
    expect(s.timeline.handCounts[3]).toBe(5)
    expect(s.timeline.nextTurn).toBe(2)
  })

  it('a failed ask passes the turn to the target', () => {
    const s = play([{ kind: 'ask', requester: 1, target: 2, card: c('6s'), success: false }])
    expect(s.timeline.nextTurn).toBe(2)
  })

  it('transfers to and from me update my hand', () => {
    const s = play([
      { kind: 'ask', requester: 0, target: 1, card: c('6s'), success: true },
      { kind: 'ask', requester: 3, target: 0, card: c('qh'), success: true },
    ])
    expect([...s.timeline.myHand]).toContain(c('6s'))
    expect([...s.timeline.myHand]).not.toContain(c('qh'))
    expect(s.knowledge.cards[c('qh')].owner).toBe(3)
    expect(s.timeline.handCounts[0]).toBe(6)
  })

  it('deduces a card by elimination through a clause', () => {
    // Rahul must hold a Minor ♠ card. Rule out everything except 7♠ for Rahul.
    const s = play([
      { kind: 'ask', requester: 1, target: 0, card: c('6s'), success: false },
      { kind: 'fact', player: 1, card: c('2s'), has: false },
      { kind: 'fact', player: 1, card: c('4s'), has: false },
    ])
    expect(s.knowledge.cards[c('7s')].owner).toBe(1)
  })

  it('deduces via hand size: a full known hand rules out everything else', () => {
    const facts: NewEvent[] = ['2h', '3h', '4h', '5h', '6h', '7h'].map((x) => ({ kind: 'fact', player: 3, card: c(x), has: true }))
    const s = play(facts)
    expect(s.knowledge.players[3].possible.length).toBe(0)
    expect(s.knowledge.cards[c('6s')].possible).not.toContain(3)
    expect(s.knowledge.sets[1].heldBy).toBe(1) // Minor Hearts proven with Team 2
    expect(s.knowledge.score).toEqual([0, 1])
  })

  it('tracks team-level knowledge when the exact holder is unknown', () => {
    // Only Amit and Priya (both Team 1) remain possible for 6♠.
    const s = play(
      [1, 3, 5, 6, 7].map((p) => ({ kind: 'fact', player: p, card: c('6s'), has: false }) as NewEvent),
    )
    const ck = s.knowledge.cards[c('6s')]
    expect(ck.possible).toEqual([2, 4])
    expect(ck.team).toBe(0)
    expect(ck.status).toBe('uncertain')
  })

  it('declaring a set lays it down and scores it', () => {
    const s = play([
      { kind: 'fact', player: 2, card: c('2s'), has: true },
      { kind: 'fact', player: 2, card: c('4s'), has: true },
      { kind: 'fact', player: 4, card: c('6s'), has: true },
      { kind: 'fact', player: 6, card: c('7s'), has: true },
      { kind: 'declare', team: 0, set: 0, holders: [2, 0, 2, 0, 4, 6] },
    ])
    expect(s.knowledge.sets[0].laidDownBy).toBe(0)
    expect(s.knowledge.score).toEqual([1, 0])
    expect(s.timeline.handCounts[0]).toBe(4)
    expect(s.knowledge.cards[c('3s')].status).toBe('out')
  })
})

describe('data integrity', () => {
  const reject = (evs: NewEvent[], last: NewEvent) => {
    const base = play(evs)
    const r = tryAddEvent(setup, base.events, last)
    expect(r.ok).toBe(false)
    return r.ok ? '' : r.error
  }

  it('rejects asking yourself or a teammate', () => {
    reject([], { kind: 'ask', requester: 1, target: 1, card: c('6s'), success: false })
    reject([], { kind: 'ask', requester: 1, target: 3, card: c('6s'), success: false })
  })

  it('rejects me asking for a set I hold nothing of, or a card I hold', () => {
    expect(reject([], { kind: 'ask', requester: 0, target: 1, card: c('6h'), success: false })).toMatch(/no Minor Hearts/)
    reject([], { kind: 'ask', requester: 0, target: 1, card: c('3s'), success: false })
  })

  it('enforces the truth when I am the target', () => {
    reject([], { kind: 'ask', requester: 1, target: 0, card: c('3s'), success: false })
    reject([], { kind: 'ask', requester: 1, target: 0, card: c('6s'), success: true })
  })

  it('rejects a transfer from someone proven not to hold the card', () => {
    reject([{ kind: 'ask', requester: 1, target: 2, card: c('6s'), success: false }], {
      kind: 'ask', requester: 3, target: 2, card: c('6s'), success: true,
    })
  })

  it('rejects asking for a card the asker is known to hold', () => {
    reject([{ kind: 'ask', requester: 2, target: 1, card: c('6s'), success: true }], {
      kind: 'ask', requester: 2, target: 3, card: c('6s'), success: false,
    })
  })

  it('rejects a card being in two hands', () => {
    reject([{ kind: 'fact', player: 1, card: c('6s'), has: true }], { kind: 'fact', player: 3, card: c('6s'), has: true })
  })

  it('rejects an ask from a player who cannot hold any card of the set', () => {
    // Rule out every Minor ♠ card (except my 3♠ 5♠) for Rahul, then he "asks" for 6♠.
    const facts: NewEvent[] = ['2s', '4s', '7s'].map((x) => ({ kind: 'fact', player: 1, card: c(x), has: false }))
    reject(facts, { kind: 'ask', requester: 1, target: 2, card: c('6s'), success: false })
  })

  it('rejects asks for laid-down sets and deals exceeding hand size', () => {
    const facts: NewEvent[] = ['2h', '3h', '4h', '5h', '6h', '7h'].map((x) => ({ kind: 'fact', player: 3, card: c(x), has: true }))
    reject(facts, { kind: 'fact', player: 3, card: c('6s'), has: true })
  })

  it('makeEvent produces unique ids', () => {
    const a = makeEvent({ kind: 'fact', player: 1, card: 0, has: false })
    const b = makeEvent({ kind: 'fact', player: 1, card: 0, has: false })
    expect(a.id).not.toBe(b.id)
    expect(setOf(0)).toBe(0)
  })
})

describe('8-player tables have no 8s or Jokers', () => {
  it('rejects asking for an 8 at an 8-player table', () => {
    const r = tryAddEvent(setup, [], { kind: 'ask', requester: 1, target: 2, card: 48, success: false })
    expect(r.ok).toBe(false)
  })
})
