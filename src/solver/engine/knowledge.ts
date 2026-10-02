import { cardsOfSet, setOf, type CardId, type SetId } from './cards'
import type { BuiltProblem } from './constraints'
import { OUT, type Timeline } from './history'
import type { Analysis } from './solver'
import { modeOf, teamOf, type GameSetup, type PlayerId, type TeamId } from './types'

export type CardStatus = 'out' | 'known' | 'uncertain'

export interface CardKnowledge {
  card: CardId
  status: CardStatus
  /** Proven current owner (status 'known'). */
  owner: PlayerId | null
  laidDownBy: TeamId | null
  /** Players who could currently hold it (a single entry when known). */
  possible: PlayerId[]
  /** Estimated probability per player (sums to 1 unless laid down). */
  prob: number[]
  teamProb: [number, number]
  /** Team proven to hold it, even when the exact player is unknown. */
  team: TeamId | null
  /** Why each player is ruled out: event index, -2 = "that's you and you don't have it", -3 = "proven by elimination". */
  ruledOut: { player: PlayerId; event: number }[]
  unverified: boolean
}

export interface ClauseView {
  set: SetId
  cards: CardId[]
  events: number[]
}

export interface PlayerKnowledge {
  player: PlayerId
  team: TeamId
  handCount: number
  known: CardId[]
  possible: CardId[] // could hold, not proven
  impossible: CardId[] // in play, proven not in this hand
  unknownCount: number // hand slots whose card is not known
  atLeastOne: ClauseView[] // "holds at least one of …"
  expectedBySet: number[]
}

export interface SetKnowledge {
  set: SetId
  cards: CardId[]
  laidDownBy: TeamId | null
  /** Team proven to hold all six (not yet laid down). */
  heldBy: TeamId | null
  completedBy: TeamId | null
  certainByTeam: [number, number]
  expectedByTeam: [number, number]
  /** Probability that each team currently holds all six cards. */
  pComplete: [number, number]
}

export interface Knowledge {
  cards: CardKnowledge[]
  players: PlayerKnowledge[]
  sets: SetKnowledge[]
  score: [number, number]
  /** Sampled full deals: current owner per card (-1 = laid down). Used by the recommender. */
  samples: Int8Array[]
}

export function deriveKnowledge(setup: GameSetup, tl: Timeline, built: BuiltProblem, an: Analysis): Knowledge {
  const { vars, varOf, exclusion, clauses } = built
  const mode = modeOf(setup)
  const P = mode.players
  const NUM_CARDS = mode.cards
  const NUM_SETS = Math.max(...mode.sets) + 1
  const ALL_SETS: SetId[] = Array.from({ length: NUM_SETS }, (_, s) => s)

  const laidDownByCard = new Array<TeamId | null>(NUM_CARDS).fill(null)
  const currentFixed = new Int8Array(NUM_CARDS).fill(-2) // known current owner, OUT, or -2 unknown
  for (let c = 0; c < NUM_CARDS; c++) {
    const m = tl.moves[c]
    if (m.length) currentFixed[c] = m[m.length - 1].to
    else if (varOf[c] < 0) currentFixed[c] = setup.me // my untouched starting card
    if (currentFixed[c] === OUT) laidDownByCard[c] = tl.laidDownBy[setOf(c)]
  }

  const cards: CardKnowledge[] = []
  for (let c = 0; c < NUM_CARDS; c++) {
    const prob = new Array(P).fill(0)
    const ruledOut: { player: PlayerId; event: number }[] = []
    let possible: PlayerId[] = []
    let unverified = false
    const fixed = currentFixed[c]
    if (fixed === OUT) {
      cards.push({
        card: c, status: 'out', owner: null, laidDownBy: laidDownByCard[c], possible: [], prob,
        teamProb: [0, 0], team: laidDownByCard[c], ruledOut, unverified,
      })
      continue
    }
    if (fixed >= 0) {
      possible = [fixed]
      prob[fixed] = 1
    } else {
      const v = varOf[c]
      for (let p = 0; p < P; p++) {
        if (an.possible[v] & (1 << p)) {
          possible.push(p)
          prob[p] = an.marginal[v * P + p]
        } else {
          const e = exclusion[c * P + p]
          ruledOut.push({ player: p, event: e === -1 ? -3 : e })
        }
      }
      unverified = an.unverified[v] !== 0
    }
    const teamProb: [number, number] = [0, 0]
    prob.forEach((x, p) => (teamProb[teamOf(p)] += x))
    const teams = new Set(possible.map(teamOf))
    const known = possible.length === 1
    cards.push({
      card: c,
      status: known ? 'known' : 'uncertain',
      owner: known ? possible[0] : null,
      laidDownBy: null,
      possible,
      prob,
      teamProb,
      team: teams.size === 1 ? [...teams][0] : null,
      ruledOut,
      unverified,
    })
  }

  // Full sampled deals in terms of current owners of all cards.
  const samples = an.samples.map((s) => {
    const deal = new Int8Array(NUM_CARDS)
    for (let c = 0; c < NUM_CARDS; c++) {
      const f = currentFixed[c]
      deal[c] = f === OUT ? -1 : f >= 0 ? f : s[varOf[c]]
    }
    return deal
  })

  const players: PlayerKnowledge[] = []
  for (let p = 0; p < P; p++) {
    const known: CardId[] = []
    const possible: CardId[] = []
    const impossible: CardId[] = []
    const expectedBySet = new Array(NUM_SETS).fill(0)
    for (const ck of cards) {
      if (ck.status === 'out') continue
      if (ck.owner === p) known.push(ck.card)
      else if (ck.possible.includes(p)) possible.push(ck.card)
      else impossible.push(ck.card)
      expectedBySet[setOf(ck.card)] += ck.prob[p]
    }
    const atLeastOne: ClauseView[] = clauses
      .filter((cl) => cl.player === p)
      .map((cl) => ({
        set: cl.set,
        cards: cl.vars.map((v) => vars[v]).filter((c) => cards[c].possible.includes(p)),
        events: cl.events,
      }))
      // A clause already satisfied by a proven card, or reduced to one card (now known), says nothing new.
      .filter((cl) => cl.cards.length > 1 && !cl.cards.some((c) => cards[c].owner === p))
    players.push({
      player: p,
      team: teamOf(p),
      handCount: tl.handCounts[p],
      known,
      possible,
      impossible,
      unknownCount: tl.handCounts[p] - known.length,
      atLeastOne,
      expectedBySet,
    })
  }

  const sets: SetKnowledge[] = ALL_SETS.map((s) => {
    const cs = cardsOfSet(s)
    const laidDownBy = tl.laidDownBy[s]
    const certainByTeam: [number, number] = [0, 0]
    const expectedByTeam: [number, number] = [0, 0]
    for (const c of cs) {
      const ck = cards[c]
      if (ck.team !== null && ck.status !== 'out') certainByTeam[ck.team]++
      expectedByTeam[0] += ck.teamProb[0]
      expectedByTeam[1] += ck.teamProb[1]
    }
    let heldBy: TeamId | null = null
    if (laidDownBy === null) {
      if (certainByTeam[0] === 6) heldBy = 0
      else if (certainByTeam[1] === 6) heldBy = 1
    }
    const pComplete: [number, number] = [0, 0]
    if (laidDownBy === null && samples.length) {
      for (const d of samples) {
        const t0 = teamOf(d[cs[0]])
        if (cs.every((c) => teamOf(d[c]) === t0)) pComplete[t0]++
      }
      pComplete[0] /= samples.length
      pComplete[1] /= samples.length
    }
    if (heldBy !== null) {
      pComplete[heldBy] = 1
      pComplete[1 - heldBy] = 0
    }
    return {
      set: s, cards: cs, laidDownBy, heldBy, completedBy: laidDownBy ?? heldBy,
      certainByTeam, expectedByTeam, pComplete,
    }
  })

  const score: [number, number] = [0, 0]
  sets.forEach((s) => {
    if (s.completedBy !== null) score[s.completedBy]++
  })

  return { cards, players, sets, score, samples }
}
