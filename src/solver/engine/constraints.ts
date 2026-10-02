import { cardLabel, cardsOfSet, setOf, type CardId } from './cards'
import type { Timeline } from './history'
import { modeOf, type GameEvent, type GameSetup, type PlayerId } from './types'
import type { Clause, Problem } from './solver'

/**
 * Builds the solver problem from the event log.
 *
 * Unknowns are the initial owners of never-moved cards (which equal their current
 * owners). Every observation made at time t is translated into a constraint on
 * those unknowns by looking up where each card was at time t — which is known
 * exactly for any card that has ever moved (see history.ts).
 */

export interface ClauseInfo extends Clause {
  set: number
  events: number[] // events that produced this clause
}

export interface BuiltProblem {
  problem: Problem
  vars: CardId[] // var index -> card
  varOf: Int16Array // card -> var index, or -1
  clauses: ClauseInfo[]
  /** First event that ruled out card c for player p: exclusion[c * 8 + p] (-1 = none, -2 = my own knowledge) */
  exclusion: Int16Array
  contradiction: { message: string; eventIndex: number } | null
}

const VAR = -2

export function buildProblem(setup: GameSetup, events: GameEvent[], tl: Timeline): BuiltProblem {
  const { me } = setup
  const name = (p: PlayerId) => (p === me ? 'You' : setup.players[p])
  const mode = modeOf(setup)
  const NUM_CARDS = mode.cards
  const NUM_PLAYERS = mode.players
  const HAND_SIZE = mode.handSize
  const initialFixed = new Int8Array(NUM_CARDS).fill(VAR)
  const mine = new Set(setup.myCards)
  for (let c = 0; c < NUM_CARDS; c++) {
    const m = tl.moves[c]
    if (m.length) initialFixed[c] = m[0].from
    else if (mine.has(c)) initialFixed[c] = me
  }

  const vars: CardId[] = []
  const varOf = new Int16Array(NUM_CARDS).fill(-1)
  for (let c = 0; c < NUM_CARDS; c++) {
    if (initialFixed[c] === VAR) {
      varOf[c] = vars.length
      vars.push(c)
    }
  }

  const exclusion = new Int16Array(NUM_CARDS * NUM_PLAYERS).fill(-1)
  const domains = new Uint8Array(vars.length).fill(0xff & ~(1 << me))
  vars.forEach((c) => (exclusion[c * NUM_PLAYERS + me] = -2))

  const slots = new Array(NUM_PLAYERS).fill(HAND_SIZE)
  for (let c = 0; c < NUM_CARDS; c++) if (initialFixed[c] !== VAR) slots[initialFixed[c]]--

  let contradiction: BuiltProblem['contradiction'] = null
  const contradict = (message: string, eventIndex: number) => {
    if (!contradiction) contradiction = { message, eventIndex }
  }
  slots.forEach((s, p) => {
    if (s < 0) contradict(`${name(p)} would have been dealt more than ${HAND_SIZE} cards.`, events.length - 1)
  })

  /** Owner of `card` just before event t: a player, OUT, or VAR (unknown, never moved). */
  const ownerAt = (card: CardId, t: number): number => {
    const m = tl.moves[card]
    let last: number | null = null
    for (const mv of m) if (mv.t < t) last = mv.to
    if (last !== null) return last
    return initialFixed[card]
  }

  const notOwner = (card: CardId, p: PlayerId, t: number, why: string) => {
    const o = ownerAt(card, t)
    if (o === VAR) {
      const v = varOf[card]
      if (domains[v] & (1 << p)) {
        domains[v] &= ~(1 << p)
        if (exclusion[card * NUM_PLAYERS + p] === -1) exclusion[card * NUM_PLAYERS + p] = t
      }
    } else if (o === p) contradict(why, t)
  }

  const isOwner = (card: CardId, p: PlayerId, t: number, why: string) => {
    const o = ownerAt(card, t)
    if (o === VAR) {
      const v = varOf[card]
      for (let q = 0; q < NUM_PLAYERS; q++) {
        if (q !== p && domains[v] & (1 << q)) {
          domains[v] &= ~(1 << q)
          if (exclusion[card * NUM_PLAYERS + q] === -1) exclusion[card * NUM_PLAYERS + q] = t
        }
      }
      if (!(domains[v] & (1 << p))) contradict(why, t)
    } else if (o !== p) contradict(why, t)
  }

  const clauseMap = new Map<string, ClauseInfo>()
  const atLeastOne = (p: PlayerId, cards: CardId[], set: number, t: number, why: string) => {
    const lits: number[] = []
    for (const c of cards) {
      const o = ownerAt(c, t)
      if (o === p) return // already satisfied by a card we know p held then
      if (o === VAR) lits.push(varOf[c])
    }
    if (!lits.length) {
      contradict(why, t)
      return
    }
    lits.sort((a, b) => a - b)
    const key = p + ':' + lits.join(',')
    const existing = clauseMap.get(key)
    if (existing) existing.events.push(t)
    else clauseMap.set(key, { player: p, vars: lits, set, events: [t] })
  }

  events.forEach((ev, t) => {
    if (ev.kind === 'ask') {
      const { requester: a, target: b, card } = ev
      const set = setOf(card)
      notOwner(card, a, t, `${name(a)} was already known to hold ${cardLabel(card)}.`)
      if (!ev.success) notOwner(card, b, t, `${name(b)} is known to hold ${cardLabel(card)}.`)
      atLeastOne(
        a,
        cardsOfSet(set).filter((c) => c !== card),
        set,
        t,
        `${name(a)} can't hold any other card of that set, so they couldn't have asked for ${cardLabel(card)}.`,
      )
    } else if (ev.kind === 'fact') {
      if (ev.has) isOwner(ev.card, ev.player, t, `${name(ev.player)} can't hold ${cardLabel(ev.card)}.`)
      else notOwner(ev.card, ev.player, t, `${name(ev.player)} is known to hold ${cardLabel(ev.card)}.`)
    }
    // declare: fully captured by the moves to OUT (holders are observed directly).
  })

  // Drop clause literals whose domain no longer allows the player, and drop clauses
  // implied by a unit fact (they carry no information for the solver).
  const deduped = new Map<string, ClauseInfo>()
  for (const cl of clauseMap.values()) {
    const vs = cl.vars.filter((v) => domains[v] & (1 << cl.player))
    if (vs.length === 0) {
      contradict(`${name(cl.player)} can't hold any card that their earlier ask requires.`, cl.events[cl.events.length - 1])
      continue
    }
    const key = cl.player + ':' + vs.join(',')
    const existing = deduped.get(key)
    if (existing) existing.events.push(...cl.events)
    else deduped.set(key, { ...cl, vars: vs, events: [...cl.events] })
  }
  // A clause implied by a stricter one of the same player adds nothing.
  const all = [...deduped.values()]
  const clauses = all.filter(
    (cl) => !all.some((o) => o !== cl && o.player === cl.player && o.vars.length < cl.vars.length && o.vars.every((v) => cl.vars.includes(v))),
  )

  return {
    problem: { nVars: vars.length, nPlayers: NUM_PLAYERS, domains, slots, clauses },
    vars,
    varOf,
    clauses,
    exclusion,
    contradiction,
  }
}
