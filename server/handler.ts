import type { ClientMsg } from '../shared/protocol.js'
import { ActionError, addPlayer, cleanName, etagFor, findByToken, maintain, newCode, newPlayer, newRoom, normCode, reduce, snapshotFor, type RoomData } from './room.js'
import { getStore } from './store.js'
import { botDue, botStep, withBots } from './bots.js'
import { isTableSize } from '../shared/rules.js'

/**
 * The game API — one endpoint, used identically by the Vercel function
 * (api/room.ts) and the local dev server (server/dev.ts).
 *
 *   GET  /api/room?code=ABC123&token=…&etag=…   poll: your snapshot, or {unchanged:true}
 *   POST /api/room  { code?, token?, msg }       act: create / join / any in-game action
 *
 * Every response carries only the caller's own view: public table + their hand.
 */

export interface ApiReply {
  snapshot?: ReturnType<typeof snapshotFor>
  etag?: string
  welcome?: { code: string; token: string; playerId: string }
  unchanged?: true
  error?: string
  fatal?: boolean
}

const json = (body: ApiReply, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

const GONE = 'That game is no longer available.'

/** The caller's view, with practice bots always counted as online (they may have joined during this request). */
function reply(room: RoomData, playerId: string, presence: Record<string, number>, now: number) {
  const p = withBots(room, presence, now)
  return { snapshot: snapshotFor(room, playerId, p, now), etag: etagFor(room, p, now) }
}

/** Load → mutate → compare-and-set save, retrying on concurrent writes. */
async function mutate(code: string, fn: (room: RoomData, presence: Record<string, number>, now: number) => boolean | void): Promise<{ room: RoomData; presence: Record<string, number>; now: number }> {
  const store = getStore()
  for (let attempt = 0; attempt < 8; attempt++) {
    const [room, rawPresence] = await Promise.all([store.load(code), store.presence(code)])
    if (!room) throw new ActionError(GONE, true)
    const now = Date.now()
    const presence = withBots(room, rawPresence, now)
    const expected = room.version
    const changed = fn(room, presence, now)
    if (changed === false) return { room, presence, now }
    room.version = expected + 1
    room.lastActivity = now
    if (await store.save(room, expected)) return { room, presence, now }
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * (attempt + 1)))
  }
  throw new ActionError('The table is busy — please try again.')
}

export async function handleGet(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const code = normCode(url.searchParams.get('code'))
    const token = url.searchParams.get('token')
    const store = getStore()
    let [room, presence] = await Promise.all([store.load(code), store.presence(code)])
    if (!room) return json({ error: GONE, fatal: true })
    const me = findByToken(room, token)
    if (!me) return json({ error: 'You are no longer at this table.', fatal: true })
    let now = Date.now()
    presence = withBots(room, presence, now)
    // Polling doubles as the heartbeat; write presence at most every few seconds.
    if (now - (presence[me.id] ?? 0) > 4000) {
      await store.touch(code, me.id, now)
      presence = { ...presence, [me.id]: now }
    }
    // Lazy housekeeping (rare): host handover, dropping long-gone lobby guests.
    const probe = structuredClone(room)
    if (maintain(probe, presence, now)) ({ room, presence, now } = await mutate(code, (r, p, t) => maintain(r, { ...p, [me.id]: t }, t)))
    // Practice bots move lazily, one move per poll once the last move has played out on screen.
    if (botDue(room, now)) ({ room, presence, now } = await mutate(code, (r, _p, t) => botStep(r, t)))
    if (!room.players.some((p) => p.id === me.id)) return json({ error: 'You are no longer at this table.', fatal: true })
    const r = reply(room, me.id, presence, now)
    if (r.etag === url.searchParams.get('etag')) return json({ unchanged: true, etag: r.etag })
    return json(r)
  } catch (e) {
    return fail(e)
  }
}

export async function handlePost(req: Request): Promise<Response> {
  try {
    const text = await req.text()
    if (text.length > 4096) return json({ error: 'Request too large.' }, 413)
    let body: { code?: string; token?: string; msg?: ClientMsg }
    try {
      body = JSON.parse(text)
    } catch {
      return json({ error: 'Malformed request.' }, 400)
    }
    const msg = body.msg
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return json({ error: 'Malformed request.' }, 400)
    const store = getStore()

    if (msg.type === 'create') {
      const name = cleanName(msg.name)
      if (!name) return json({ error: 'Please enter your name.' })
      if (!isTableSize(msg.size)) return json({ error: 'Choose a 6- or 8-player table.' })
      const now = Date.now()
      const host = newPlayer(name, now)
      for (let i = 0; i < 10; i++) {
        const room = newRoom(newCode(), host, now, msg.size)
        room.version = 1
        if (await store.save(room, 0)) {
          await store.touch(room.code, host.id, now)
          const presence = { [host.id]: now }
          return json({ welcome: { code: room.code, token: host.token, playerId: host.id }, ...reply(room, host.id, presence, now) })
        }
      }
      return json({ error: 'Could not create a table — please try again.' })
    }

    const code = normCode(body.code)
    if (!code) return json({ error: GONE, fatal: true })

    if (msg.type === 'join') {
      const name = cleanName(msg.name)
      if (!name) return json({ error: 'Please enter your name.' })
      let joined: { id: string; token: string } | null = null
      const { room, presence, now } = await mutate(code, (r, _p, t) => {
        const p = addPlayer(r, name, t)
        joined = { id: p.id, token: p.token }
      })
      const j = joined as { id: string; token: string } | null
      if (!j) throw new ActionError(GONE, true)
      await store.touch(code, j.id, now)
      const pres = { ...presence, [j.id]: now }
      return json({ welcome: { code, token: j.token, playerId: j.id }, ...reply(room, j.id, pres, now) })
    }

    let meId = ''
    const { room, presence, now } = await mutate(code, (r, p, t) => {
      const me = findByToken(r, body.token)
      if (!me) throw new ActionError('You are no longer at this table.', true)
      meId = me.id
      return reduce(r, me, msg, { ...p, [me.id]: t }, t)
    })
    await store.touch(code, meId, now)
    const pres = { ...presence, [meId]: now }
    if (msg.type === 'leave' || !room.players.some((p) => p.id === meId)) return json({})
    return json({ ...reply(room, meId, pres, now) })
  } catch (e) {
    return fail(e)
  }
}

function fail(e: unknown): Response {
  if (e instanceof ActionError) return json({ error: e.message, fatal: e.fatal || undefined })
  console.error(e)
  return json({ error: 'Something went wrong on the server.' }, 500)
}
