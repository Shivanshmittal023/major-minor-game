import { cardLabel, cardsOfSet, setLabel, setOf, type CardId } from './cards'
import { modeOf, teamOf, type GameEvent, type GameSetup, type PlayerId, type TeamId } from './types'

/**
 * Replays the event log and records every card movement.
 *
 * Key insight the whole engine rests on: every card movement in this game is
 * public (a successful ask names the card, a declaration lays cards face up).
 * So a card that has ever moved has a fully known history, and a card that has
 * never moved is still with whoever was dealt it. The only hidden information is
 * the initial deal of never-moved cards, which is what the solver reasons about.
 */

export const OUT = -1 // "laid down on the table as part of a completed set"

export interface Move {
  t: number // index of the event that caused the move
  from: PlayerId
  to: PlayerId | typeof OUT
}

export interface Timeline {
  moves: Move[][] // per card, chronological
  handCounts: number[] // current hand size per player
  handCountsBefore: number[][] // hand sizes just before each event
  myHandBefore: Set<CardId>[] // my exact hand just before each event
  myHand: Set<CardId> // my current hand
  laidDownBy: (TeamId | null)[] // per set
  nextTurn: PlayerId // whose turn it is by the usual rules
}

export class EventError extends Error {
  eventIndex: number
  constructor(message: string, eventIndex: number) {
    super(message)
    this.eventIndex = eventIndex
  }
}

export function validateSetup(setup: GameSetup): string[] {
  const errors: string[] = []
  const mode = modeOf(setup)
  if (setup.players.length !== mode.players) errors.push(`There must be exactly ${mode.players} players.`)
  setup.players.forEach((n, i) => {
    if (!n.trim()) errors.push(`Player ${i + 1} needs a name.`)
  })
  const names = setup.players.map((n) => n.trim().toLowerCase()).filter(Boolean)
  if (new Set(names).size !== names.length) errors.push('Player names must be unique.')
  if (setup.me < 0 || setup.me >= mode.players) errors.push('Select which player you are.')
  if (setup.myCards.length !== mode.handSize) errors.push(`Select exactly ${mode.handSize} starting cards (you have ${setup.myCards.length}).`)
  if (new Set(setup.myCards).size !== setup.myCards.length) errors.push('Duplicate cards selected.')
  if (setup.myCards.some((c) => !Number.isInteger(c) || c < 0 || c >= mode.cards)) errors.push('Invalid card selected.')
  return errors
}

/** Where a card is right now if its location is publicly known from moves / my hand. */
function trackedLocation(card: CardId, moves: Move[][], myHand: Set<CardId>, me: PlayerId): PlayerId | typeof OUT | null {
  const m = moves[card]
  if (m.length) return m[m.length - 1].to
  if (myHand.has(card)) return me
  return null
}

export function replay(setup: GameSetup, events: GameEvent[]): Timeline {
  const { me, players } = setup
  const name = (p: PlayerId) => (p === me ? 'You' : players[p])
  const mode = modeOf(setup)
  const N = mode.cards
  const P = mode.players
  const moves: Move[][] = Array.from({ length: N }, () => [])
  const handCounts = new Array(P).fill(mode.handSize)
  const handCountsBefore: number[][] = []
  const myHandBefore: Set<CardId>[] = []
  const myHand = new Set(setup.myCards)
  const laidDownBy: (TeamId | null)[] = new Array(Math.max(...mode.sets) + 1).fill(null)
  let nextTurn = setup.firstTurn

  const move = (card: CardId, from: PlayerId, to: PlayerId | typeof OUT, t: number) => {
    moves[card].push({ t, from, to })
    handCounts[from]--
    if (to !== OUT) handCounts[to]++
    if (from === me) myHand.delete(card)
    if (to === me) myHand.add(card)
  }

  events.forEach((ev, t) => {
    handCountsBefore.push([...handCounts])
    myHandBefore.push(new Set(myHand))
    const fail = (msg: string): never => {
      throw new EventError(msg, t)
    }
    const validPlayer = (p: number) => Number.isInteger(p) && p >= 0 && p < P

    if (ev.kind === 'ask') {
      const { requester: a, target: b, card } = ev
      if (!validPlayer(a) || !validPlayer(b)) fail('Unknown player.')
      if (!Number.isInteger(card) || card < 0 || card >= N) fail('Unknown card.')
      if (a === b) fail('A player cannot ask themselves.')
      if (teamOf(a) === teamOf(b)) fail(`${name(a)} and ${name(b)} are teammates — players can only ask opponents.`)
      const set = setOf(card)
      if (laidDownBy[set] !== null) fail(`${setLabel(set)} has already been completed and laid down.`)
      if (handCounts[a] === 0) fail(`${name(a)} has no cards left and cannot ask.`)
      if (handCounts[b] === 0) fail(`${name(b)} has no cards left and cannot be asked.`)
      if (a === me) {
        if (myHand.has(card)) fail(`You already hold ${cardLabel(card)}.`)
        if (!cardsOfSet(set).some((c) => myHand.has(c))) fail(`You hold no ${setLabel(set)} card, so you can't ask for ${cardLabel(card)}.`)
      }
      if (b === me && ev.success !== myHand.has(card)) {
        fail(myHand.has(card) ? `You hold ${cardLabel(card)}, so you must have handed it over.` : `You don't hold ${cardLabel(card)}, so the ask can't have succeeded.`)
      }
      const loc = trackedLocation(card, moves, myHand, me)
      if (loc !== null && loc !== OUT) {
        if (loc === a) fail(`${name(a)} is known to already hold ${cardLabel(card)}.`)
        if (ev.success && loc !== b) fail(`${cardLabel(card)} is known to be with ${name(loc)}, not ${name(b)}.`)
      }
      if (ev.success) {
        move(card, b, a, t)
        nextTurn = a
      } else {
        nextTurn = b
      }
    } else if (ev.kind === 'declare') {
      const { set, team, holders } = ev
      if (!Number.isInteger(set) || !mode.sets.includes(set)) fail('Unknown set.')
      if (laidDownBy[set] !== null) fail(`${setLabel(set)} was already laid down.`)
      if (holders.length !== 6) fail('Every card of the set needs a holder.')
      const cards = cardsOfSet(set)
      const laying = new Array(P).fill(0)
      holders.forEach((h, i) => {
        if (!validPlayer(h)) fail(`Choose who held ${cardLabel(cards[i])}.`)
        if (teamOf(h) !== team) fail(`${name(h)} is not on the declaring team.`)
        laying[h]++
        const loc = trackedLocation(cards[i], moves, myHand, me)
        if (loc !== null && loc !== h) fail(`${cardLabel(cards[i])} is known to be with ${loc === OUT ? 'nobody' : name(loc)}, not ${name(h)}.`)
        if (h === me && !myHand.has(cards[i])) fail(`You don't hold ${cardLabel(cards[i])}.`)
      })
      laying.forEach((n, p) => {
        if (n > handCounts[p]) fail(`${name(p)} only has ${handCounts[p]} card(s) but would lay down ${n}.`)
      })
      holders.forEach((h, i) => move(cards[i], h, OUT, t))
      laidDownBy[set] = team
    } else if (ev.kind === 'fact') {
      const { player: p, card } = ev
      if (!validPlayer(p)) fail('Unknown player.')
      if (p === me) fail('Facts are for other players — your own hand is tracked automatically.')
      const loc = trackedLocation(card, moves, myHand, me)
      if (loc === OUT) fail(`${cardLabel(card)} has been laid down already.`)
      if (loc !== null) {
        if (ev.has && loc !== p) fail(`${cardLabel(card)} is known to be with ${name(loc)}.`)
        if (!ev.has && loc === p) fail(`${name(p)} is known to hold ${cardLabel(card)}.`)
      }
      if (ev.has && handCounts[p] === 0) fail(`${name(p)} has no cards.`)
    }
  })

  return { moves, handCounts, handCountsBefore, myHandBefore, myHand, laidDownBy, nextTurn }
}
