import { cardLabel, cardsOfSet, setLabel, setOf, type CardId, type SetId } from './cards'
import type { Timeline } from './history'
import type { Knowledge } from './knowledge'
import { teamOf, type GameEvent, type GameSetup, type PlayerId } from './types'

/**
 * Scores every legal ask available to me and explains the best ones.
 *
 * For a candidate "ask T for card X" (X in set S):
 *   p           = P(T holds X), from the sampled consistent deals
 *   onSuccess   = gain a card and keep the turn
 *                 + progress of my team towards completing S
 *                 + how few of S's cards remain with opponents afterwards (from the
 *                   sampled deals *conditioned* on T holding X)
 *                 + chance of stripping T of their last S card (they lose the right to ask for S)
 *                 + blocking opponents who are close to S themselves
 *   onFailure   = information gained (entropy drop of X's location)
 *                 − losing the turn to T
 *   score       = p · onSuccess + (1 − p) · onFailure
 *
 * Weights are deliberately simple and live in WEIGHTS so they can be tuned later.
 */

export const WEIGHTS = {
  gainCard: 1.0,
  progress: 2.0,
  closeness: 1.5,
  denial: 0.6,
  blocking: 0.15,
  resilience: 0.3,
  infoPerBit: 0.5,
  loseTurn: 1.0,
  revealSet: 0.2,
}

export type Strength = 'certain' | 'strong' | 'moderate' | 'speculative'

export interface MoveSuggestion {
  target: PlayerId
  card: CardId
  set: SetId
  probability: number
  score: number
  strength: Strength
  reasons: string[]
}

export interface Recommendation {
  moves: MoveSuggestion[]
  note: string | null
  candidates: number
}

function entropy(ps: number[]): number {
  let h = 0
  for (const p of ps) if (p > 0) h -= p * Math.log2(p)
  return h
}

function strengthOf(p: number): Strength {
  if (p >= 0.999) return 'certain'
  if (p >= 0.6) return 'strong'
  if (p >= 0.3) return 'moderate'
  return 'speculative'
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1]
}

export function recommendMoves(
  setup: GameSetup,
  events: GameEvent[],
  tl: Timeline,
  kn: Knowledge,
  limit = 4,
): Recommendation {
  const me = setup.me
  const myTeam = teamOf(me)
  const name = (p: PlayerId) => setup.players[p]
  const myHand = [...tl.myHand]

  if (myHand.length === 0) return { moves: [], note: 'You have no cards left, so you cannot ask. Your teammates carry on.', candidates: 0 }

  // Sets whose cards I've already exposed publicly (asked for, or received in a transfer).
  const revealed = new Set<SetId>()
  events.forEach((ev) => {
    if (ev.kind === 'ask' && (ev.requester === me || (ev.target === me && ev.success))) revealed.add(setOf(ev.card))
  })

  const mySets = new Map<SetId, CardId[]>()
  for (const c of myHand) {
    const s = setOf(c)
    if (!mySets.has(s)) mySets.set(s, [])
    mySets.get(s)!.push(c)
  }

  const samples = kn.samples
  const moves: MoveSuggestion[] = []
  let candidates = 0

  for (const [set, held] of mySets) {
    const sk = kn.sets[set]
    if (sk.laidDownBy !== null) continue
    const oppTeam = 1 - myTeam
    for (const card of cardsOfSet(set)) {
      if (tl.myHand.has(card)) continue
      const ck = kn.cards[card]
      if (ck.status === 'out') continue
      for (let t = 0; t < 8; t++) {
        if (t === me || tl.handCounts[t] === 0) continue
        if (teamOf(t) === myTeam) continue // asking a teammate never moves a card to the team
        candidates++
        const p = ck.prob[t]
        if (p <= 0) continue

        // Conditional statistics from sampled deals where t holds the card.
        let n = 0
        let oppRemaining = 0
        let lastOfSet = 0
        for (const d of samples) {
          if (d[card] !== t) continue
          n++
          let opp = 0
          let tOther = 0
          for (const c of sk.cards) {
            if (c === card || d[c] < 0) continue
            if (teamOf(d[c]) === oppTeam) opp++
            if (d[c] === t) tOther++
          }
          oppRemaining += opp
          if (tOther === 0) lastOfSet++
        }
        if (n > 0) {
          oppRemaining /= n
          lastOfSet /= n
        } else {
          oppRemaining = Math.max(0, sk.expectedByTeam[oppTeam] - 1)
          lastOfSet = 0
        }

        const securedAfter = sk.certainByTeam[myTeam] + 1
        const onSuccess =
          WEIGHTS.gainCard +
          WEIGHTS.progress * (securedAfter / 6) ** 2 +
          WEIGHTS.closeness / (1 + oppRemaining) +
          WEIGHTS.denial * lastOfSet +
          WEIGHTS.blocking * sk.certainByTeam[oppTeam] +
          (held.length === 1 ? WEIGHTS.resilience : 0)

        const after = ck.prob.map((x, q) => (q === t ? 0 : x))
        const rest = 1 - p
        const infoBits = rest > 1e-9 ? entropy(ck.prob) - entropy(after.map((x) => x / rest)) : 0
        const onFailure =
          WEIGHTS.infoPerBit * Math.max(0, infoBits) - WEIGHTS.loseTurn - (revealed.has(set) ? 0 : WEIGHTS.revealSet)

        const score = p * onSuccess + (1 - p) * onFailure

        // --- explanation ---
        const reasons: string[] = []
        reasons.push(`You hold ${held.map(cardLabel).join(', ')} from ${setLabel(set)}, so ${cardLabel(card)} is a legal ask.`)
        const possibleOpp = ck.possible.filter((q) => teamOf(q) !== myTeam)
        if (p >= 0.999) {
          reasons.push(`${name(t)} is proven to hold ${cardLabel(card)}.`)
        } else {
          const pct = Math.round(p * 100)
          const who = ck.possible.map((q) => (q === me ? 'you' : name(q)))
          reasons.push(
            `${cardLabel(card)} could be with ${listNames(who)} — ${name(t)} is estimated at ~${pct}%` +
              (possibleOpp.length === 1 ? ' (the only opponent who can have it).' : '.'),
          )
        }
        const clause = kn.players[t].atLeastOne.find((c) => c.set === set)
        if (clause) reasons.push(`${name(t)} asked for a ${setLabel(set)} card earlier, so they hold at least one card of this set.`)
        if (securedAfter === 6) reasons.push(`This completes ${setLabel(set)} for your team.`)
        else if (securedAfter >= 3)
          reasons.push(`Your team would have ${securedAfter}/6 of ${setLabel(set)} confirmed.`)
        if (oppRemaining < 0.05 && securedAfter < 6) reasons.push(`The other missing cards look to be with your teammates, so the set is within reach.`)
        else if (oppRemaining >= 0.05 && securedAfter < 6) reasons.push(`About ${oppRemaining.toFixed(1)} other card(s) of this set would still be with opponents.`)
        if (lastOfSet >= 0.5 && p >= 0.3) reasons.push(`Likely strips ${name(t)} of their last ${setLabel(set)} card, so they can no longer ask for it.`)
        if (sk.certainByTeam[oppTeam] >= 3) reasons.push(`Blocks opponents, who are known to hold ${sk.certainByTeam[oppTeam]} cards of this set.`)
        if (p < 0.999 && infoBits > 0.3) reasons.push(`Even a miss narrows down where ${cardLabel(card)} is.`)

        moves.push({ target: t, card, set, probability: p, score, strength: strengthOf(p), reasons })
      }
    }
  }

  moves.sort((a, b) => b.score - a.score || b.probability - a.probability)
  let note: string | null = null
  if (!moves.length) {
    note = 'No ask can succeed right now — every card you could ask for is proven to be with your team.'
  } else if (moves[0].probability < 0.3) {
    note = 'Information is still thin — the top suggestion is a best guess, not a sure thing.'
  }
  return { moves: moves.slice(0, limit), note, candidates }
}
