/**
 * Constraint solver for the hidden initial deal.
 *
 * Problem: assign each unknown card ("variable") to a player such that
 *   1. the card's owner is in its domain (bitmask of allowed players),
 *   2. each player p receives exactly slots[p] variables (hand-size constraint),
 *   3. every clause (player P, vars V) is satisfied: at least one var in V is P's.
 *      Clauses come from "P asked for a card of set S, so P held some card of S".
 *
 * The solver answers three things:
 *   - feasible?          depth-first search + unit propagation + bipartite flow pruning
 *   - exact domains      for every (card, player) pair, is there ANY consistent deal
 *                        with that card there? (proven by a witness, or refuted by search)
 *   - probabilities      uniform distribution over consistent deals, estimated with an
 *                        MCMC sampler (swap / 3-cycle moves preserve hand sizes)
 *
 * "Impossible" is only ever reported when the search fully refutes a pair, so the UI
 * never claims certainty that hasn't been proven. If the search budget runs out, the
 * pair is conservatively kept as possible.
 */

export interface Clause {
  player: number
  vars: number[]
}

export interface Problem {
  nVars: number
  nPlayers: number
  domains: Uint8Array // per var, bitmask over players
  slots: number[] // per player
  clauses: Clause[]
}

export interface Analysis {
  feasible: boolean
  /** Proven-possible owners per var (bitmask). Exact unless `unverified` is set for that var. */
  possible: Uint8Array
  /** Pairs kept possible only because the search budget ran out. */
  unverified: Uint8Array
  /** marginal[v * nPlayers + p] = estimated P(var v belongs to p) */
  marginal: Float64Array
  /** Sampled consistent deals (each: owner per var). Used for joint queries. */
  samples: Int8Array[]
}

export interface AnalyzeOptions {
  seed?: number
  chains?: number
  samplesPerChain?: number
  thin?: number
  burnIn?: number
  nodeLimit?: number
}

class BudgetExceeded extends Error {}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const bit = (p: number) => 1 << p

function bitsOf(mask: number, nPlayers: number): number[] {
  const out: number[] = []
  for (let p = 0; p < nPlayers; p++) if (mask & bit(p)) out.push(p)
  return out
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function popcount(x: number): number {
  let c = 0
  while (x) {
    x &= x - 1
    c++
  }
  return c
}

export class Solver {
  private pb: Problem
  private rng: () => number
  private nodes = 0
  private nodeLimit: number
  /** clauses touching each var, used by the sampler */
  private varClauses: number[][]
  private playerClauses: number[][]

  constructor(pb: Problem, rng: () => number, nodeLimit = 20000) {
    this.pb = pb
    this.rng = rng
    this.nodeLimit = nodeLimit
    this.varClauses = Array.from({ length: pb.nVars }, () => [])
    this.playerClauses = Array.from({ length: pb.nPlayers }, () => [])
    pb.clauses.forEach((c, k) => {
      c.vars.forEach((v) => this.varClauses[v].push(k))
      this.playerClauses[c.player].push(k)
    })
  }

  /** Find one consistent assignment (owner per var), or null if none exists. Throws BudgetExceeded. */
  findSolution(domains: Uint8Array = this.pb.domains): Int8Array | null {
    this.nodes = 0
    const assign = new Int8Array(this.pb.nVars).fill(-1)
    const load = new Array(this.pb.nPlayers).fill(0)
    return this.search(Uint8Array.from(domains), assign, load)
  }

  private search(dom: Uint8Array, assign: Int8Array, load: number[]): Int8Array | null {
    if (++this.nodes > this.nodeLimit) throw new BudgetExceeded()
    const { nVars, nPlayers, slots, clauses } = this.pb

    // --- unit propagation ---
    let changed = true
    while (changed) {
      changed = false
      let open = 0
      for (let p = 0; p < nPlayers; p++) if (load[p] < slots[p]) open |= bit(p)
      for (let v = 0; v < nVars; v++) {
        if (assign[v] >= 0) continue
        const d = dom[v] & open
        if (d === 0) return null
        if ((d & (d - 1)) === 0) {
          const p = 31 - Math.clz32(d)
          assign[v] = p
          load[p]++
          if (load[p] === slots[p]) open &= ~bit(p)
          changed = true
        }
      }
      for (const cl of clauses) {
        const P = cl.player
        let satisfied = false
        let lits = 0
        let lastLit = -1
        for (const v of cl.vars) {
          if (assign[v] === P) {
            satisfied = true
            break
          }
          if (assign[v] < 0 && dom[v] & bit(P) && load[P] < slots[P]) {
            lits++
            lastLit = v
          }
        }
        if (satisfied) continue
        if (lits === 0) return null
        if (lits === 1) {
          assign[lastLit] = P
          load[P]++
          changed = true
        }
      }
      if (changed) continue
      // Clause packing: pairwise-disjoint unsatisfied clauses of P each need their own
      // slot. More than P's free slots → dead end; exactly as many → P's remaining
      // cards must all come from those clauses.
      const r = this.packClauses(dom, assign, load)
      if (r < 0) return null
      if (r > 0) changed = true
    }

    // --- flow check: can the remaining vars fill the remaining slots? ---
    const matching = this.flow(dom, assign, load)
    if (!matching) return null

    // --- branch on the most constrained unsatisfied clause ---
    let best: number[] | null = null
    let bestPlayer = -1
    for (const cl of clauses) {
      const P = cl.player
      if (cl.vars.some((v) => assign[v] === P)) continue
      const lits = cl.vars.filter((v) => assign[v] < 0 && dom[v] & bit(P))
      if (!best || lits.length < best.length) {
        best = lits
        bestPlayer = P
      }
    }
    if (!best) return matching // all clauses already hold; flow gives a full valid deal

    const lits = shuffle([...best], this.rng)
    for (let i = 0; i < lits.length; i++) {
      const d2 = Uint8Array.from(dom)
      const a2 = Int8Array.from(assign)
      const l2 = [...load]
      for (let j = 0; j < i; j++) d2[lits[j]] &= ~bit(bestPlayer) // symmetry: earlier branches covered those
      d2[lits[i]] = bit(bestPlayer)
      const r = this.search(d2, a2, l2)
      if (r) return r
    }
    return null
  }

  /** Returns -1 on contradiction, otherwise the number of domain values removed. */
  private packClauses(dom: Uint8Array, assign: Int8Array, load: number[]): number {
    const { nPlayers, slots } = this.pb
    let removed = 0
    for (let P = 0; P < nPlayers; P++) {
      const lits = this.openLits(P, dom, assign)
      if (!lits.length) continue
      lits.sort((a, b) => a.length - b.length)
      const used = new Set<number>()
      let packed = 0
      for (const l of lits) {
        if (l.some((v) => used.has(v))) continue
        l.forEach((v) => used.add(v))
        packed++
      }
      const cap = slots[P] - load[P]
      if (packed > cap) return -1
      if (packed === cap) {
        for (let v = 0; v < dom.length; v++) {
          if (assign[v] < 0 && dom[v] & bit(P) && !used.has(v)) {
            dom[v] &= ~bit(P)
            removed++
          }
        }
      }
    }
    return removed
  }

  /** Available literals of each unsatisfied clause of player P. */
  private openLits(P: number, dom: Uint8Array, assign: Int8Array): number[][] {
    const out: number[][] = []
    for (const k of this.playerClauses[P]) {
      const cl = this.pb.clauses[k]
      if (cl.vars.some((v) => assign[v] === P)) continue
      out.push(cl.vars.filter((v) => assign[v] < 0 && dom[v] & bit(P)))
    }
    return out
  }

  /** Bipartite b-matching of unassigned vars into remaining slots (augmenting paths). */
  private flow(dom: Uint8Array, assign: Int8Array, load: number[]): Int8Array | null {
    const { nVars, nPlayers, slots } = this.pb
    const owner = Int8Array.from(assign)
    const cap = slots.map((s, p) => s - load[p])
    const members: number[][] = Array.from({ length: nPlayers }, () => [])
    const free: number[] = []
    for (let v = 0; v < nVars; v++) if (assign[v] < 0) free.push(v)
    shuffle(free, this.rng)
    const used = new Array(nPlayers).fill(0)
    let visited = 0

    const augment = (v: number): boolean => {
      const opts = shuffle(bitsOf(dom[v], nPlayers), this.rng)
      for (const p of opts) {
        if (cap[p] <= 0 || visited & bit(p)) continue
        visited |= bit(p)
        if (used[p] < cap[p]) {
          owner[v] = p
          members[p].push(v)
          used[p]++
          return true
        }
        const list = members[p]
        for (let i = 0; i < list.length; i++) {
          const u = list[i]
          if (augment(u)) {
            list[i] = v
            owner[v] = p
            return true
          }
        }
      }
      return false
    }

    for (const v of free) {
      visited = 0
      if (!augment(v)) return null
    }
    return owner
  }

  /**
   * Uniform MCMC over consistent deals. Moves swap owners of two cards, or rotate
   * three; both preserve every hand size, and both are symmetric proposals, so
   * accepting exactly the constraint-satisfying moves targets the uniform distribution.
   */
  sample(start: Int8Array, count: number, thin: number, burnIn: number, onSample: (s: Int8Array) => void) {
    const { nVars, clauses, domains } = this.pb
    if (nVars < 2) {
      for (let i = 0; i < count; i++) onSample(start)
      return
    }
    const owner = Int8Array.from(start)
    const satCount = clauses.map((cl) => cl.vars.reduce((n, v) => n + (owner[v] === cl.player ? 1 : 0), 0))
    const delta = new Int32Array(clauses.length)
    const touched: number[] = []
    const rng = this.rng

    const tryMove = (vs: number[], ps: number[]): boolean => {
      for (let i = 0; i < vs.length; i++) if (!(domains[vs[i]] & bit(ps[i]))) return false
      touched.length = 0
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i]
        const old = owner[v]
        for (const k of this.varClauses[v]) {
          const P = clauses[k].player
          if (P === old) {
            if (delta[k] === 0) touched.push(k)
            delta[k]--
          } else if (P === ps[i]) {
            if (delta[k] === 0) touched.push(k)
            delta[k]++
          }
        }
      }
      let ok = true
      for (const k of touched) if (satCount[k] + delta[k] < 1) ok = false
      for (const k of touched) {
        if (ok) satCount[k] += delta[k]
        delta[k] = 0
      }
      if (ok) for (let i = 0; i < vs.length; i++) owner[vs[i]] = ps[i]
      return ok
    }

    const total = burnIn + count * thin
    for (let step = 0; step < total; step++) {
      const a = Math.floor(rng() * nVars)
      const b = Math.floor(rng() * nVars)
      const pa = owner[a]
      const pb = owner[b]
      if (pa !== pb) {
        if (rng() < 0.75 || nVars < 3) {
          tryMove([a, b], [pb, pa])
        } else {
          const c = Math.floor(rng() * nVars)
          const pc = owner[c]
          if (pc !== pa && pc !== pb) tryMove([a, b, c], [pb, pc, pa])
        }
      }
      if (step >= burnIn && (step - burnIn) % thin === 0) onSample(Int8Array.from(owner))
    }
  }
}

export function analyze(pb: Problem, opts: AnalyzeOptions = {}): Analysis {
  const { nVars, nPlayers } = pb
  const chains = opts.chains ?? 4
  const perChain = opts.samplesPerChain ?? 800
  const thin = opts.thin ?? 6
  const burnIn = opts.burnIn ?? 600
  const rng = mulberry32(opts.seed ?? 12345)
  const solver = new Solver(pb, rng, opts.nodeLimit ?? 20000)

  const possible = new Uint8Array(nVars)
  const unverified = new Uint8Array(nVars)
  const marginal = new Float64Array(nVars * nPlayers)
  const samples: Int8Array[] = []
  const infeasible: Analysis = { feasible: false, possible, unverified, marginal, samples }

  // Quick sanity checks that make the problem trivially infeasible.
  if (pb.slots.some((s) => s < 0)) return infeasible
  if (pb.clauses.some((c) => c.vars.length === 0)) return infeasible
  for (let v = 0; v < nVars; v++) if (pb.domains[v] === 0) return infeasible

  const mark = (sol: Int8Array) => {
    for (let v = 0; v < nVars; v++) possible[v] |= bit(sol[v])
  }

  // 1. Find starting solutions (one per chain, randomized for diversity).
  const starts: Int8Array[] = []
  for (let i = 0; i < chains; i++) {
    let sol: Int8Array | null
    try {
      sol = solver.findSolution()
    } catch {
      sol = null
      if (i === 0) {
        // Couldn't decide within budget: stay conservative, claim nothing is impossible.
        possible.set(pb.domains)
        unverified.set(pb.domains)
        return { feasible: true, possible, unverified, marginal: uniformMarginal(pb), samples }
      }
    }
    if (!sol) {
      if (i === 0) return infeasible
      continue
    }
    starts.push(sol)
    mark(sol)
  }

  // 2. Sample. Every sample is also a witness for possibility.
  for (const s of starts) {
    solver.sample(s, perChain, thin, burnIn, (x) => {
      samples.push(x)
      for (let v = 0; v < nVars; v++) marginal[v * nPlayers + x[v]]++
    })
  }
  for (const x of samples) mark(x)
  const n = samples.length || 1
  for (let i = 0; i < marginal.length; i++) marginal[i] /= n

  // 3. Every pair not yet witnessed gets an explicit, targeted search.
  for (let v = 0; v < nVars; v++) {
    const missing = pb.domains[v] & ~possible[v]
    if (!missing) continue
    for (const p of bitsOf(missing, nPlayers)) {
      if (possible[v] & bit(p)) continue // a later witness may have covered it
      const dom = Uint8Array.from(pb.domains)
      dom[v] = bit(p)
      try {
        const sol = solver.findSolution(dom)
        if (sol) mark(sol)
      } catch {
        possible[v] |= bit(p)
        unverified[v] |= bit(p)
      }
    }
  }

  // Pairs that are possible but never appeared in sampling get a small floor, so the
  // UI never shows 0% for something that can happen.
  for (let v = 0; v < nVars; v++) {
    let sum = 0
    const floor = 0.005
    for (let p = 0; p < nPlayers; p++) {
      const i = v * nPlayers + p
      if (!(possible[v] & bit(p))) marginal[i] = 0
      else if (marginal[i] < floor) marginal[i] = floor
      sum += marginal[i]
    }
    if (sum > 0) for (let p = 0; p < nPlayers; p++) marginal[v * nPlayers + p] /= sum
  }

  return { feasible: true, possible, unverified, marginal, samples }
}

function uniformMarginal(pb: Problem): Float64Array {
  const m = new Float64Array(pb.nVars * pb.nPlayers)
  for (let v = 0; v < pb.nVars; v++) {
    const k = popcount(pb.domains[v])
    for (let p = 0; p < pb.nPlayers; p++) if (pb.domains[v] & bit(p)) m[v * pb.nPlayers + p] = 1 / k
  }
  return m
}
