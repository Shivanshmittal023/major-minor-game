import { beforeEach, describe, expect, it } from 'vitest'
import { cardsOfSet, setOf } from '../../shared/cards.js'
import type { ClientMsg, Snapshot } from '../../shared/protocol.js'
import { teamOfSeat } from '../../shared/rules.js'
import { handOf } from '../game.js'
import { handleGet, handlePost, type ApiReply } from '../handler.js'
import { MemoryStore, parsePresence, setStore } from '../store.js'

/**
 * Drives the real HTTP handlers (the same code Vercel runs) with an in-memory
 * store: 8 independent "devices", each with its own token, playing full games.
 */

let store: MemoryStore
beforeEach(() => {
  store = new MemoryStore()
  setStore(store)
})

class Device {
  code = ''
  token = ''
  id = ''
  etag = ''
  last: Snapshot | null = null
  replies: ApiReply[] = []
  async post(msg: ClientMsg): Promise<ApiReply> {
    const res = await handlePost(new Request('http://t/api/room', { method: 'POST', body: JSON.stringify({ code: this.code, token: this.token, msg }) }))
    const r = (await res.json()) as ApiReply
    this.absorb(r)
    return r
  }
  async poll(): Promise<ApiReply> {
    const res = await handleGet(new Request(`http://t/api/room?code=${this.code}&token=${this.token}&etag=${this.etag}`))
    const r = (await res.json()) as ApiReply
    this.absorb(r)
    return r
  }
  private absorb(r: ApiReply) {
    this.replies.push(r)
    if (r.welcome) Object.assign(this, { code: r.welcome.code, token: r.welcome.token, id: r.welcome.playerId })
    if (r.etag) this.etag = r.etag
    if (r.snapshot) this.last = r.snapshot
  }
}

async function table(size: 6 | 8 = 8) {
  const host = new Device()
  await host.post({ type: 'create', name: 'Asha', size })
  const others = await Promise.all(
    ['Rahul', 'Amit', 'Meera', 'Priya', 'Dev', 'Sara', 'Kiran'].slice(0, size - 1).map(async (n) => {
      const d = new Device()
      d.code = host.code
      await d.post({ type: 'join', code: host.code, name: n })
      return d
    }),
  )
  const all = [host, ...others]
  await Promise.all(all.map((d) => d.poll()))
  return { host, others, all }
}

describe('lobby over the API', () => {
  it('creates a room, and concurrent joins all land (compare-and-set, no lost writes)', async () => {
    const { host } = await table()
    expect(host.code).toMatch(/^[A-Z2-9]{6}$/)
    await host.poll()
    expect(host.last!.players).toHaveLength(8)
    expect(host.last!.players.every((p) => p.connected)).toBe(true)
  })

  it('rejects duplicate names and unknown codes; anyone may start a full table', async () => {
    const { host, others } = await table()
    const dup = new Device()
    dup.code = host.code
    expect((await dup.post({ type: 'join', code: host.code, name: 'RAHUL' })).error).toMatch(/already uses/)
    const lost = new Device()
    lost.code = 'ZZZZZZ'
    expect((await lost.post({ type: 'join', code: 'ZZZZZZ', name: 'X' })).fatal).toBe(true)
    // No host: any player can start once every seat is filled.
    expect((await others[3].post({ type: 'start' })).error).toBeUndefined()
    expect(others[3].last!.phase).toBe('playing')
  })
  it('players are seated as they join; 8 seated needed; polling returns unchanged when nothing moved', async () => {
    const { host, others } = await table()
    await host.poll()
    expect(host.last!.seating.every(Boolean)).toBe(true) // everyone took a seat on arrival
    await host.post({ type: 'seat', playerId: others[0].id, seat: null })
    expect((await host.post({ type: 'start' })).error).toMatch(/Seat all 8/)
    await host.post({ type: 'autoSeat' })
    await host.poll()
    expect((await host.poll()).unchanged).toBe(true)
    await host.post({ type: 'start' })
    expect(host.last!.phase).toBe('playing')
  })

  it('never exposes tokens or other hands', async () => {
    const { host, all } = await table()
    await host.post({ type: 'autoSeat' })
    await host.post({ type: 'start' })
    for (const d of all) {
      await d.poll()
      const raw = JSON.stringify(d.last)
      for (const other of all) expect(raw).not.toContain(other.token)
      expect(raw).not.toMatch(/owner|token/)
    }
  })
})

describe('a full game over the API', () => {
  it.each([8, 6] as const)('plays to the end at a %i-player table; each device only sees its own hand; retries are idempotent', async (size) => {
    const { host, all } = await table(size)
    await host.post({ type: 'autoSeat' })
    await host.post({ type: 'start' })
    await Promise.all(all.map((d) => d.poll()))
    const bySeat = new Map(all.map((d) => [d.last!.you.seat!, d]))
    let n = 0
    let dupChecked = false
    for (;;) {
      let room = (await store.load(host.code))!
      if (room.phase !== 'playing' || n++ > 3000) break
      // Declare (from any seat, any time) every set one team fully holds.
      for (let set = 0; set < room.game!.completed.length && room.phase === 'playing'; set++) {
        if (room.game!.completed[set] !== null) continue
        const owners = cardsOfSet(set).map((x) => room.game!.owner[x])
        if (owners.every((o) => teamOfSeat(o) === teamOfSeat(owners[0]))) {
          const r = await bySeat.get(owners[0])!.post({ type: 'declare', set, holders: owners, actionId: `d${n}-${set}` })
          expect(r.error).toBeUndefined()
          room = (await store.load(host.code))!
        }
      }
      if (room.phase !== 'playing') break
      const g = room.game!
      const d = bySeat.get(g.turn)!
      await d.poll()
      expect(d.last!.hand).toEqual(handOf(g, g.turn))
      const hand = d.last!.hand!
      // Random (not counter-based) choices, so scripted play can't fall into a repeating cycle.
      const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
      const set = setOf(pick(hand))
      const want = cardsOfSet(set).filter((c) => !hand.includes(c))
      const card = pick(want)
      const opps = d.last!.game!.seats.filter((s) => s.team !== teamOfSeat(g.turn) && s.cardCount > 0)
      if (!opps.length) continue
      const holder = g.owner[card]
      const target = Math.random() < 0.5 && opps.some((o) => o.seat === holder) ? holder : pick(opps).seat
      const actionId = `a${n}`
      await d.post({ type: 'ask', target, card, actionId })
      if (!dupChecked) {
        const v = (await store.load(host.code))!.version
        await d.post({ type: 'ask', target, card, actionId }) // network retry
        expect((await store.load(host.code))!.version).toBe(v)
        dupChecked = true
      }
    }
    await host.poll()
    expect(host.last!.phase).toBe('finished')
    expect(host.last!.size).toBe(size)
    expect(host.last!.game!.score[0] + host.last!.game!.score[1]).toBe(size === 8 ? 8 : 9)
  })

  it('rejects out-of-turn asks', async () => {
    const { host, all } = await table()
    await host.post({ type: 'autoSeat' })
    await host.post({ type: 'start' })
    const turn = (await store.load(host.code))!.game!.turn
    await Promise.all(all.map((d) => d.poll()))
    const wrong = all.find((d) => d.last!.you.seat !== turn)!
    expect((await wrong.post({ type: 'ask', target: 1, card: 0, actionId: 'x' })).error).toMatch(/not your turn/)
  })
})

describe('presence, refresh and host handover', () => {
  it('a device that reloads (same token, fresh client) gets its seat and hand back', async () => {
    const { host, others } = await table()
    await host.post({ type: 'autoSeat' })
    await host.post({ type: 'start' })
    const fresh = new Device()
    Object.assign(fresh, { code: host.code, token: others[3].token })
    await fresh.poll()
    const room = (await store.load(host.code))!
    expect(fresh.last!.you.seat).not.toBeNull()
    expect(fresh.last!.hand).toEqual(handOf(room.game!, fresh.last!.you.seat!))
  })

  it('marks silent devices offline', async () => {
    const { host, others } = await table()
    await store.touch(host.code, host.id, Date.now() - 120_000)
    await others[0].poll()
    expect(others[0].last!.players.find((p) => p.id === host.id)!.connected).toBe(false)
  })
  it('leaving the lobby removes you; the table carries on for everyone else', async () => {
    const { host, others } = await table()
    await host.post({ type: 'leave' })
    await others[0].poll()
    expect(others[0].last!.players.some((p) => p.id === host.id)).toBe(false)
    expect(others[0].last!.seating.includes(null)).toBe(true)
    expect((await host.poll()).fatal).toBe(true)
    expect(JSON.stringify(others[0].last)).not.toMatch(/isHost|hostId/)
  })
})

describe('table sizes', () => {
  it('a 6-player table has 6 seats, needs 6 players, and deals 9 cards each', async () => {
    const { host, all } = await table(6)
    await host.poll()
    expect(host.last!.size).toBe(6)
    expect(host.last!.seating).toHaveLength(6)
    await host.post({ type: 'autoSeat' })
    await host.post({ type: 'start' })
    for (const d of all) {
      await d.poll()
      expect(d.last!.hand).toHaveLength(9)
    }
    expect(host.last!.game!.completed).toHaveLength(9)
  })

  it('rejects an invalid size and a 7th player at a 6-player table cannot be seated', async () => {
    const bad = new Device()
    expect((await bad.post({ type: 'create', name: 'X', size: 7 as 6 })).error).toMatch(/6- or 8-player/)
    const { host } = await table(6)
    const extra = new Device()
    extra.code = host.code
    await extra.post({ type: 'join', code: host.code, name: 'Kiran' })
    await host.post({ type: 'autoSeat' })
    await host.poll()
    expect(host.last!.seating.filter(Boolean)).toHaveLength(6)
    expect(host.last!.players.find((p) => p.name === 'Kiran')!.seat).toBeNull()
    expect((await host.post({ type: 'seat', playerId: extra.id, seat: 6 })).error).toMatch(/Unknown seat/)
  })
})

describe('team selection is open to everyone', () => {
  it('any player can seat themselves, move others, auto-fill, shuffle and swap teams', async () => {
    const { host, others } = await table()
    const [rahul, amit] = others
    expect((await rahul.post({ type: 'seat', playerId: rahul.id, seat: 3 })).error).toBeUndefined()
    expect(rahul.last!.seating[3]).toBe(rahul.id)
    expect((await amit.post({ type: 'seat', playerId: host.id, seat: 0 })).error).toBeUndefined()
    expect((await amit.post({ type: 'autoSeat' })).error).toBeUndefined()
    expect(amit.last!.seating.every(Boolean)).toBe(true)
    expect((await rahul.post({ type: 'shuffleSeats' })).error).toBeUndefined()
    const before = [...rahul.last!.seating]
    await amit.post({ type: 'swapTeams' })
    before.forEach((id, i) => expect(amit.last!.seating[(i + 7) % 8]).toBe(id))
  })

  it('everyone is equal: any player can remove a lobby guest, add bots and start', async () => {
    const { host, others } = await table()
    expect((await others[0].post({ type: 'kick', playerId: others[1].id })).error).toBeUndefined()
    expect(others[0].last!.players.some((p) => p.id === others[1].id)).toBe(false)
    expect((await others[2].post({ type: 'fillBots' })).error).toBeUndefined()
    expect((await others[4].post({ type: 'start' })).error).toBeUndefined()
    expect(others[4].last!.phase).toBe('playing')
    expect((await others[0].post({ type: 'seat', playerId: others[0].id, seat: 0 })).error).toMatch(/started/)
    void host
  })
})

describe('Redis presence parsing', () => {
  it('reads Upstash HGETALL in raw array form and object form', () => {
    expect(parsePresence(['a', '100', 'b', '200'])).toEqual({ a: 100, b: 200 })
    expect(parsePresence({ a: '100', b: 200 })).toEqual({ a: 100, b: 200 })
    expect(parsePresence(null)).toEqual({})
    expect(parsePresence(['a', 'x'])).toEqual({})
  })
})

describe('memory game: no history leaves the server', () => {
  it('devices only ever receive the last few events, plus an ask counter', async () => {
    const { host, all } = await table()
    await host.post({ type: 'autoSeat' })
    await host.post({ type: 'start' })
    await Promise.all(all.map((d) => d.poll()))
    const bySeat = new Map(all.map((d) => [d.last!.you.seat!, d]))
    for (let i = 0; i < 15; i++) {
      const room = (await store.load(host.code))!
      const g = room.game!
      const d = bySeat.get(g.turn)!
      await d.poll()
      const hand = d.last!.hand!
      const card = cardsOfSet(setOf(hand[0])).find((c) => !hand.includes(c))!
      const opp = d.last!.game!.seats.find((s) => s.team !== teamOfSeat(g.turn) && s.cardCount > 0)!
      await d.post({ type: 'ask', target: opp.seat, card, actionId: `m${i}` })
    }
    const full = (await store.load(host.code))!.game!.log.length
    await host.poll()
    const snap = host.last!.game!
    expect(full).toBeGreaterThan(10)
    expect(snap.recent.length).toBeLessThanOrEqual(6)
    expect(snap.askCount).toBe(15)
    expect(JSON.stringify(host.last)).not.toContain('"log"')
  })
})

describe('practice bots', () => {
  it.each([8, 6] as const)('one person plus bots can play a full %i-player game', async (size) => {
    const { setBotDelay } = await import('../bots.js')
    setBotDelay(0)
    try {
      const me = new Device()
      await me.post({ type: 'create', name: 'Solo', size })
      expect((await me.post({ type: 'fillBots' })).error).toBeUndefined()
      expect(me.last!.players.filter((p) => p.bot)).toHaveLength(size - 1)
      expect(me.last!.players.every((p) => p.connected)).toBe(true) // bots are always online
      await me.post({ type: 'start' })
      expect(me.last!.phase).toBe('playing')
      const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
      for (let i = 0; i < 6000 && me.last!.phase === 'playing'; i++) {
        await me.poll() // each poll lets a due bot make one move
        const s = me.last!
        if (s.phase !== 'playing' || s.game!.turn !== s.you.seat) continue
        // My turn: declare a set my team holds entirely (from server truth, to keep the test short), else ask randomly.
        const room = (await store.load(me.code))!
        const g = room.game!
        const mine = [...Array(g.completed.length).keys()].find(
          (st) => g.completed[st] === null && cardsOfSet(st).some((c) => g.owner[c] === s.you.seat) && cardsOfSet(st).every((c) => g.owner[c] >= 0 && teamOfSeat(g.owner[c]) === teamOfSeat(s.you.seat!)),
        )
        if (mine !== undefined) {
          await me.post({ type: 'declare', set: mine, holders: cardsOfSet(mine).map((c) => g.owner[c]), actionId: `d${i}` })
          continue
        }
        const hand = s.hand!
        const opps = s.game!.seats.filter((x) => x.team !== teamOfSeat(s.you.seat!) && x.cardCount > 0)
        if (!hand.length || !opps.length) continue
        const set = setOf(pick(hand))
        await me.post({ type: 'ask', target: pick(opps).seat, card: pick(cardsOfSet(set).filter((c) => !hand.includes(c))), actionId: `a${i}` })
      }
      await me.poll()
      expect(me.last!.phase).toBe('finished')
      expect(me.last!.game!.score[0] + me.last!.game!.score[1]).toBe(size === 8 ? 8 : 9)
    } finally {
      setBotDelay(2500)
    }
  }, 60_000)

  it('anyone can add bots, and the creator gets no special role', async () => {
    const creator = new Device()
    await creator.post({ type: 'create', name: 'Creator', size: 6 })
    const guest = new Device()
    guest.code = creator.code
    await guest.post({ type: 'join', code: creator.code, name: 'Guest' })
    expect((await guest.post({ type: 'fillBots' })).error).toBeUndefined()
    expect(guest.last!.seating.every(Boolean)).toBe(true)
    expect(guest.last!.players.find((p) => p.name === 'Creator')).not.toHaveProperty('isHost')
  })
})

describe('team names', () => {
  it('anyone can rename a team; empty restores the default; names must differ', async () => {
    const { host, others } = await table()
    await host.poll()
    expect(host.last!.teamNames).toEqual(['Tide', 'Ember'])
    await others[0].post({ type: 'teamName', team: 0, name: '  Night  Owls ' })
    expect(others[0].last!.teamNames).toEqual(['Night Owls', 'Ember'])
    expect((await host.post({ type: 'teamName', team: 1, name: 'night owls' })).error).toMatch(/different names/)
    await host.post({ type: 'teamName', team: 0, name: '' })
    expect(host.last!.teamNames).toEqual(['Tide', 'Ember'])
    await host.post({ type: 'autoSeat' })
    await host.post({ type: 'start' })
    expect((await host.post({ type: 'teamName', team: 0, name: 'Late' })).error).toMatch(/started/)
  })
})

describe('auto-start', () => {
  it('a full, online table counts down and deals by itself', async () => {
    const { host, all } = await table(6)
    await host.poll()
    const a = host.last!.autoStart!
    expect(a.at).not.toBeNull()
    expect(a.at! - a.now).toBeGreaterThan(3000)
    // Let the countdown run out (rewind the stored deadline instead of sleeping).
    const r = (await store.load(host.code))!
    r.autoStartAt = Date.now() - 1
    r.version++
    await store.save(r, r.version - 1)
    await all[2].poll()
    expect(all[2].last!.phase).toBe('playing')
    for (const d of all) {
      await d.poll()
      expect(d.last!.hand).toHaveLength(9)
    }
  })

  it('the countdown is 10 seconds, stops when a seat empties, re-arms when it refills, and anyone can start now', async () => {
    const { host, others } = await table(6)
    await host.poll()
    const a = host.last!.autoStart!
    expect(a.at! - a.now).toBeGreaterThan(9000)
    expect(a.at! - a.now).toBeLessThanOrEqual(10_000)
    await host.post({ type: 'seat', playerId: others[0].id, seat: null })
    await host.poll()
    expect(host.last!.autoStart!.at).toBeNull()
    await others[1].post({ type: 'autoSeat' })
    await host.poll()
    expect(host.last!.autoStart!.at).not.toBeNull()
    await others[3].post({ type: 'start' })
    expect(others[3].last!.phase).toBe('playing')
  })
  it('does not count down while a seated player is offline', async () => {
    const { host, others } = await table(6)
    await store.touch(host.code, others[2].id, Date.now() - 60_000)
    await host.poll()
    expect(host.last!.autoStart!.at).toBeNull()
  })

  it('Fill with bots starts the countdown for a solo player', async () => {
    const me = new Device()
    await me.post({ type: 'create', name: 'Solo', size: 8 })
    await me.post({ type: 'fillBots' })
    await me.poll()
    expect(me.last!.autoStart!.at).not.toBeNull()
  })
})

describe('auto-skip', () => {
  it("skips a disconnected player's turn after a minute, but never an online player's", async () => {
    const { host, all } = await table(6)
    await host.post({ type: 'start' })
    let room = (await store.load(host.code))!
    const turn = room.game!.turn
    const away = all.find((d) => d.id === room.seating[turn])!
    const watcher = all.find((d) => d !== away)!
    // Online player, long wait → no skip.
    room.game!.log[room.game!.log.length - 1].t = Date.now() - 120_000
    room.version++
    await store.save(room, room.version - 1)
    await away.poll()
    await watcher.poll()
    expect((await store.load(host.code))!.game!.turn).toBe(turn)
    // Now they go silent → skipped on the next poll by anyone else.
    await store.touch(host.code, away.id, Date.now() - 60_000)
    await watcher.poll()
    room = (await store.load(host.code))!
    expect(room.game!.turn).not.toBe(turn)
    const last = room.game!.log[room.game!.log.length - 1]
    expect(last.kind === 'skip' && last.reason === 'away' && last.from === turn).toBe(true)
  })
})

describe('nobody can skip another player', () => {
  it('there is no manual skip — only the automatic one-minute skip for disconnected players', async () => {
    const { all } = await table(6)
    await all[0].post({ type: 'start' })
    for (const d of all) {
      const r = await d.post({ type: 'skipTurn' } as unknown as ClientMsg)
      expect(r.error).toMatch(/Unknown action/)
    }
  })
})

describe('countdown cancel', () => {
  it('anyone can cancel; it stays off while seats change; anyone can then start; a rematch counts down again', async () => {
    const { all, others } = await table(6)
    await all[0].poll()
    expect(all[0].last!.autoStart!.at).not.toBeNull()
    await others[2].post({ type: 'cancelAutoStart' })
    await all[0].poll()
    expect(all[0].last!.autoStart).toMatchObject({ at: null, cancelled: true })
    // Rearranging (seat empties and refills) must not pop the countdown back up.
    await others[0].post({ type: 'seat', playerId: others[0].id, seat: null })
    await all[0].poll()
    await others[0].post({ type: 'autoSeat' })
    await all[0].poll()
    await all[3].poll()
    expect(all[0].last!.autoStart).toMatchObject({ at: null, cancelled: true })
    // Anyone starts when ready.
    await others[4].post({ type: 'start' })
    expect(others[4].last!.phase).toBe('playing')
    // Finish isn't needed: back to lobby → a fresh countdown is allowed again.
    await others[1].post({ type: 'backToLobby' })
    await all[0].poll()
    expect(all[0].last!.phase).toBe('lobby')
    expect(all[0].last!.autoStart!.cancelled).toBe(false)
  })
})
