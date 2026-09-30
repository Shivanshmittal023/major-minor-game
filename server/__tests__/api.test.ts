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

  it('rejects duplicate names, unknown codes and non-host controls', async () => {
    const { host, others } = await table()
    const dup = new Device()
    dup.code = host.code
    expect((await dup.post({ type: 'join', code: host.code, name: 'RAHUL' })).error).toMatch(/already uses/)
    const lost = new Device()
    lost.code = 'ZZZZZZ'
    expect((await lost.post({ type: 'join', code: 'ZZZZZZ', name: 'X' })).fatal).toBe(true)
    expect((await others[0].post({ type: 'start' })).error).toMatch(/Only the host/)
  })

  it('needs 8 seated players; polling returns unchanged when nothing moved', async () => {
    const { host } = await table()
    expect((await host.post({ type: 'start' })).error).toMatch(/Seat all 8/)
    await host.post({ type: 'autoSeat' })
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

  it('marks silent devices offline and passes host after a minute away', async () => {
    const { host, others } = await table()
    // Pretend the host's last poll was 2 minutes ago.
    await store.touch(host.code, host.id, Date.now() - 120_000)
    await others[0].poll()
    expect(others[0].last!.players.find((p) => p.id === host.id)!.connected).toBe(false)
    expect(others[0].last!.you.isHost || others[0].last!.players.find((p) => p.isHost)!.id !== host.id).toBe(true)
  })

  it('leaving the lobby removes you and hands host on', async () => {
    const { host, others } = await table()
    await host.post({ type: 'leave' })
    await others[0].poll()
    expect(others[0].last!.players.some((p) => p.id === host.id)).toBe(false)
    expect(others[0].last!.players.find((p) => p.isHost)).toBeTruthy()
    expect((await host.poll()).fatal).toBe(true)
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

  it('starting the game and removing players stay with the host', async () => {
    const { host, others } = await table()
    await others[0].post({ type: 'autoSeat' })
    expect((await others[0].post({ type: 'start' })).error).toMatch(/Only the host/)
    expect((await others[0].post({ type: 'kick', playerId: others[1].id })).error).toMatch(/Only the host/)
    await host.post({ type: 'start' })
    expect(host.last!.phase).toBe('playing')
    expect((await others[0].post({ type: 'seat', playerId: others[0].id, seat: 0 })).error).toMatch(/started/)
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
