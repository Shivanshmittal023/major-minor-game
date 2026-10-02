import { cardsOfSet, setOf, type CardId, type SetId } from '../../shared/cards.js'
import type { LogEntry } from '../../shared/protocol.js'
import { MODES, teamOfSeat, type TableSize, type TeamId } from '../../shared/rules.js'
import { analyze, type Clause, type Problem } from './solver.js'

/**
 * The bots' brain — the Major–Minor Solver's deduction, run from one bot's seat.
 *
 * A bot sees exactly what a real player sees: its own hand, every seat's card
 * count, and the public events (each ask and its answer, each declaration with
 * the cards revealed). From that it builds the same constraint model as the
 * Solver — every card's initial owner, hand sizes, "an asker holds another card
 * of that set" — and computes which cards each player must / may / cannot hold,
 * with probabilities over every consistent deal.
 *
 * It never looks at another hand.
 */

export interface BotView {
  size: TableSize
  me: number
  hand: CardId[]
  log: LogEntry[]
  cardCounts: number[]
  completed: (TeamId | null)[]
}

export type BotMove = { kind: 'declare'; set: SetId; holders: number[] } | { kind: 'ask'; target: number; card: CardId }

const OUT = -1
const VAR = -2
/** Bank a team set before every holder is proven only when this sure (a wrong call hands it to the opponents). */
const EARLY_DECLARE = 0.9
/** With nothing useful to ask but opponents still holding cards, guess a team set only at this confidence or more. */
const GUESS_MIN = 0.75

export interface Belief {
  /** Proven current owner, OUT, or null if uncertain. */
  owner: (number | null)[]
  /** Seats that could currently hold each card. */
  possible: number[][]
  /** prob[card][seat]: estimated chance the seat holds the card. */
  prob: number[][]
  /** Sampled consistent deals: current owner per card (OUT = laid down). */
  samples: Int8Array[]
}

/** Deduce the current location of every card from one seat's point of view. */
export function infer(v: BotView, seed = 1): Belief {
  const mode = MODES[v.size]
  const N = mode.cards
  const P = v.size
  const hand = new Set(v.hand)

  // Every move in this game is public: card transfers (asks that hit) and declarations (cards revealed, then out).
  const moves: { t: number; from: number; to: number }[][] = Array.from({ length: N }, () => [])
  v.log.forEach((e, t) => {
    if (e.kind === 'ask' && e.success) moves[e.card].push({ t, from: e.target, to: e.asker })
    if (e.kind === 'declare') cardsOfSet(e.set).forEach((c, i) => moves[c].push({ t, from: e.actual[i], to: OUT }))
  })

  // A card that never moved is still with whoever was dealt it — the only hidden information.
  const initial = new Array<number>(N)
  for (let c = 0; c < N; c++) initial[c] = moves[c].length ? moves[c][0].from : hand.has(c) ? v.me : VAR

  const vars: CardId[] = []
  const varOf = new Int16Array(N).fill(-1)
  for (let c = 0; c < N; c++)
    if (initial[c] === VAR) {
      varOf[c] = vars.length
      vars.push(c)
    }
  const all = (1 << P) - 1
  const domains = new Uint8Array(vars.length).fill(all & ~(1 << v.me))
  const slots = new Array(P).fill(mode.handSize)
  for (let c = 0; c < N; c++) if (initial[c] !== VAR) slots[initial[c]]--

  const ownerAt = (c: CardId, t: number) => {
    let last: number | null = null
    for (const m of moves[c]) if (m.t < t) last = m.to
    return last ?? initial[c]
  }
  const notOwner = (c: CardId, p: number, t: number) => {
    if (ownerAt(c, t) === VAR) domains[varOf[c]] &= ~(1 << p)
  }

  const clauses: Clause[] = []
  v.log.forEach((e, t) => {
    if (e.kind !== 'ask') return
    notOwner(e.card, e.asker, t)
    if (!e.success) notOwner(e.card, e.target, t)
    // The asker held another card of that set at that moment.
    const lits: number[] = []
    let satisfied = false
    for (const c of cardsOfSet(setOf(e.card))) {
      if (c === e.card) continue
      const o = ownerAt(c, t)
      if (o === e.asker) satisfied = true
      else if (o === VAR) lits.push(varOf[c])
    }
    if (!satisfied && lits.length) clauses.push({ player: e.asker, vars: lits })
  })
  const usable = clauses
    .map((cl) => ({ player: cl.player, vars: cl.vars.filter((x) => domains[x] & (1 << cl.player)) }))
    .filter((cl) => cl.vars.length)

  const problem: Problem = { nVars: vars.length, nPlayers: P, domains, slots, clauses: usable }
  const an = analyze(problem, { seed, chains: 3, samplesPerChain: 500, thin: 5, burnIn: 400 })

  const owner: (number | null)[] = new Array(N).fill(null)
  const possible: number[][] = []
  const prob: number[][] = []
  for (let c = 0; c < N; c++) {
    const m = moves[c]
    const fixed = m.length ? m[m.length - 1].to : initial[c] === v.me ? v.me : null
    const row = new Array(P).fill(0)
    if (fixed !== null) {
      owner[c] = fixed
      possible.push(fixed === OUT ? [] : [fixed])
      if (fixed !== OUT) row[fixed] = 1
    } else {
      const x = varOf[c]
      const ps: number[] = []
      for (let p = 0; p < P; p++)
        if (an.possible[x] & (1 << p)) {
          ps.push(p)
          row[p] = an.marginal[x * P + p]
        }
      possible.push(ps)
      if (ps.length === 1) owner[c] = ps[0]
    }
    prob.push(row)
  }
  const samples = an.samples.map((s) => {
    const d = new Int8Array(N)
    for (let c = 0; c < N; c++) d[c] = owner[c] !== null ? owner[c]! : s[varOf[c]]
    return d
  })
  return { owner, possible, prob, samples }
}

const entropy = (ps: number[]) => ps.reduce((h, p) => (p > 0 ? h - p * Math.log2(p) : h), 0)

/** Pick the strongest move available, using only what this seat can know. */
export function chooseMove(v: BotView, rng: () => number = Math.random): BotMove | null {
  const b = infer(v, 1 + v.log.length * 7919 + v.me)
  const mode = MODES[v.size]
  const myTeam = teamOfSeat(v.me)
  const held = new Set(v.hand)
  const onMyTeam = (p: number) => p >= 0 && teamOfSeat(p) === myTeam
  const openSets = mode.sets.filter((s) => v.completed[s] === null)

  // 1) Declarations — only sets I hold a card of (house rule).
  let bestGuess: { set: SetId; holders: number[]; p: number } | null = null
  for (const s of openSets) {
    const cs = cardsOfSet(s)
    if (!cs.some((c) => held.has(c))) continue
    if (!cs.every((c) => b.possible[c].length > 0 && b.possible[c].every(onMyTeam))) continue
    // Proven to the exact holder → declare right away; it can't go wrong.
    if (cs.every((c) => b.owner[c] !== null)) return { kind: 'declare', set: s, holders: cs.map((c) => b.owner[c]!) }
    // Team holds it but some holders are uncertain → remember the most likely assignment.
    const tally = new Map<string, number>()
    for (const d of b.samples) {
      const k = cs.map((c) => d[c]).join(',')
      tally.set(k, (tally.get(k) ?? 0) + 1)
    }
    let topKey = ''
    let top = 0
    for (const [k, n] of tally) if (n > top) [topKey, top] = [k, n]
    const p = b.samples.length ? top / b.samples.length : 0
    if (topKey && (!bestGuess || p > bestGuess.p)) bestGuess = { set: s, holders: topKey.split(',').map(Number), p }
  }
  // A near-certain team set is worth banking before opponents can break it up.
  if (bestGuess && bestGuess.p >= EARLY_DECLARE) return { kind: 'declare', ...bestGuess }

  // 2) Asks — score every legal ask by expected value.
  const opps = Array.from({ length: v.size }, (_, p) => p).filter((p) => teamOfSeat(p) !== myTeam && v.cardCounts[p] > 0)
  let best: { target: number; card: CardId; score: number } | null = null
  for (const s of openSets) {
    const cs = cardsOfSet(s)
    if (!cs.some((c) => held.has(c))) continue
    const secured = cs.filter((c) => b.possible[c].length > 0 && b.possible[c].every(onMyTeam)).length
    for (const c of cs) {
      if (held.has(c) || b.possible[c].length === 0) continue
      const pTeam = b.possible[c].reduce((acc, p) => acc + (onMyTeam(p) ? b.prob[c][p] : 0), 0)
      if (pTeam >= 0.999) continue // already with my team — asking an opponent can't help
      const h0 = entropy(b.prob[c])
      for (const t of opps) {
        const p = b.prob[c][t]
        if (p <= 0) continue
        const after = b.prob[c].map((x, q) => (q === t ? 0 : x / (1 - p || 1)))
        const info = Math.max(0, h0 - entropy(after))
        // Hit: card gained, set progress, keep the turn. Miss: turn passes, but we learn where it isn't.
        const onHit = 1 + 2 * ((secured + 1) / 6) ** 2 + (secured + 1 === 6 ? 2 : 0)
        const onMiss = 0.4 * info - 1
        const score = p * onHit + (1 - p) * onMiss + rng() * 1e-6
        if (!best || score > best.score) best = { target: t, card: c, score }
      }
    }
  }
  if (best) return { kind: 'ask', target: best.target, card: best.card }

  // 3) Nothing worth asking. Guessing a declaration risks handing the set to the
  //    opponents; a teammate who holds more of it may know better. So guess only
  //    when fairly sure — or when nobody is left to ask and it must be called.
  if (bestGuess && (opps.length === 0 || bestGuess.p >= GUESS_MIN)) return { kind: 'declare', ...bestGuess }

  // 4) Forced move: any legal ask.
  for (const s of openSets) {
    const cs = cardsOfSet(s)
    if (!cs.some((c) => held.has(c))) continue
    const want = cs.filter((c) => !held.has(c) && b.owner[c] !== OUT)
    if (want.length && opps.length) return { kind: 'ask', target: opps[Math.floor(rng() * opps.length)], card: want[Math.floor(rng() * want.length)] }
  }
  return null
}
