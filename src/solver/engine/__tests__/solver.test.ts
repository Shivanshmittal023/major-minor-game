import { describe, expect, it } from 'vitest'
import { analyze, mulberry32, type Problem } from '../solver'

/** Enumerate every assignment of a small problem and return exact marginals. */
function bruteForce(pb: Problem) {
  const { nVars, nPlayers, domains, slots, clauses } = pb
  const counts = new Float64Array(nVars * nPlayers)
  const owner = new Int8Array(nVars)
  const load = new Array(nPlayers).fill(0)
  let total = 0
  const rec = (v: number) => {
    if (v === nVars) {
      if (load.some((l, p) => l !== slots[p])) return
      if (!clauses.every((cl) => cl.vars.some((x) => owner[x] === cl.player))) return
      total++
      for (let i = 0; i < nVars; i++) counts[i * nPlayers + owner[i]]++
      return
    }
    for (let p = 0; p < nPlayers; p++) {
      if (!(domains[v] & (1 << p)) || load[p] >= slots[p]) continue
      owner[v] = p
      load[p]++
      rec(v + 1)
      load[p]--
    }
  }
  rec(0)
  return { total, marginal: counts.map((c) => (total ? c / total : 0)) }
}

function randomProblem(rng: () => number): Problem {
  const nPlayers = 3 + Math.floor(rng() * 2)
  const slots = Array.from({ length: nPlayers }, () => 1 + Math.floor(rng() * 3))
  const nVars = slots.reduce((a, b) => a + b, 0)
  const domains = new Uint8Array(nVars)
  for (let v = 0; v < nVars; v++) {
    let d = 0
    for (let p = 0; p < nPlayers; p++) if (rng() < 0.7) d |= 1 << p
    domains[v] = d || 1 << Math.floor(rng() * nPlayers)
  }
  const clauses = Array.from({ length: Math.floor(rng() * 4) }, () => {
    const player = Math.floor(rng() * nPlayers)
    const vars = Array.from({ length: nVars }, (_, i) => i).filter(() => rng() < 0.35)
    return { player, vars: vars.length ? vars : [0] }
  })
  return { nVars, nPlayers, domains, slots, clauses }
}

describe('solver', () => {
  it('matches brute force exactly on possibility, and approximately on probability', () => {
    const rng = mulberry32(42)
    let feasibleCount = 0
    for (let trial = 0; trial < 300; trial++) {
      const pb = randomProblem(rng)
      const exact = bruteForce(pb)
      const an = analyze(pb, { seed: trial + 1, samplesPerChain: 1500, thin: 3 })
      expect(an.feasible, `trial ${trial} feasibility`).toBe(exact.total > 0)
      if (!exact.total) continue
      feasibleCount++
      for (let v = 0; v < pb.nVars; v++) {
        for (let p = 0; p < pb.nPlayers; p++) {
          const truth = exact.marginal[v * pb.nPlayers + p] > 0
          expect(!!(an.possible[v] & (1 << p)), `trial ${trial} var ${v} player ${p}`).toBe(truth)
          // Sampler accuracy: loose bound (MCMC, small problems can be poorly connected).
          if (exact.total > 3) expect(Math.abs(an.marginal[v * pb.nPlayers + p] - exact.marginal[v * pb.nPlayers + p])).toBeLessThan(0.2)
        }
      }
    }
    expect(feasibleCount).toBeGreaterThan(50)
  })

  it('detects infeasibility from hand sizes alone', () => {
    // Two cards can only go to player 0, who has one slot.
    const pb: Problem = { nVars: 2, nPlayers: 2, domains: Uint8Array.from([1, 1]), slots: [1, 1], clauses: [] }
    expect(analyze(pb).feasible).toBe(false)
  })

  it('uses clauses to force a card', () => {
    // Player 1 must hold one of {0,1}; var 0 can't be player 1 → var 1 is player 1.
    const pb: Problem = {
      nVars: 3, nPlayers: 2, domains: Uint8Array.from([1, 3, 3]), slots: [2, 1],
      clauses: [{ player: 1, vars: [0, 1] }],
    }
    const an = analyze(pb)
    expect(an.feasible).toBe(true)
    expect(an.possible[1]).toBe(2)
    expect(an.possible[2]).toBe(1)
  })
})
