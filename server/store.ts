import { Redis } from '@upstash/redis'
import type { RoomData } from './room.js'

/**
 * Where rooms live between requests. Serverless functions keep no memory, so
 * every request loads the room, applies one change and saves it back with a
 * compare-and-set on the room version — two players acting at the same instant
 * can never overwrite each other; the loser simply retries on fresh state.
 */
export interface Store {
  load(code: string): Promise<RoomData | null>
  /** Save only if the stored version still equals `expected` (0 = room must not exist). */
  save(room: RoomData, expected: number): Promise<boolean>
  /** Last-seen timestamps per player id (presence is kept apart so polling never conflicts with game writes). */
  presence(code: string): Promise<Record<string, number>>
  touch(code: string, playerId: string, at: number): Promise<void>
  remove(code: string): Promise<void>
}

export const ROOM_TTL_S = 12 * 60 * 60

const key = (code: string) => `mm:room:${code}`
const verKey = (code: string) => `mm:room:${code}:v`
const presKey = (code: string) => `mm:room:${code}:p`

// Atomic: write room + version only if the version hasn't moved; refresh all TTLs.
const CAS = `
local cur = redis.call('GET', KEYS[2])
if (cur or '0') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
redis.call('EXPIRE', KEYS[3], ARGV[4])
return 1`

class RedisStore implements Store {
  private r: Redis
  constructor(url: string, token: string) {
    this.r = new Redis({ url, token, automaticDeserialization: false })
  }
  async load(code: string) {
    const raw = await this.r.get<string>(key(code))
    return raw ? (JSON.parse(raw) as RoomData) : null
  }
  async save(room: RoomData, expected: number) {
    const ok = await this.r.eval(CAS, [key(room.code), verKey(room.code), presKey(room.code)], [String(expected), JSON.stringify(room), String(room.version), String(ROOM_TTL_S)])
    return Number(ok) === 1
  }
  async presence(code: string) {
    const h = await this.r.hgetall<Record<string, string>>(presKey(code))
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(h ?? {})) out[k] = Number(v)
    return out
  }
  async touch(code: string, playerId: string, at: number) {
    await this.r.hset(presKey(code), { [playerId]: String(at) })
  }
  async remove(code: string) {
    await this.r.del(key(code), verKey(code), presKey(code))
  }
}

/** In-process store for local development and tests. */
export class MemoryStore implements Store {
  private rooms = new Map<string, string>()
  private pres = new Map<string, Record<string, number>>()
  async load(code: string) {
    const raw = this.rooms.get(code)
    return raw ? (JSON.parse(raw) as RoomData) : null
  }
  async save(room: RoomData, expected: number) {
    const cur = this.rooms.get(room.code)
    const curV = cur ? (JSON.parse(cur) as RoomData).version : 0
    if (curV !== expected) return false
    this.rooms.set(room.code, JSON.stringify(room))
    return true
  }
  async presence(code: string) {
    return { ...(this.pres.get(code) ?? {}) }
  }
  async touch(code: string, playerId: string, at: number) {
    this.pres.set(code, { ...(this.pres.get(code) ?? {}), [playerId]: at })
  }
  async remove(code: string) {
    this.rooms.delete(code)
    this.pres.delete(code)
  }
}

let store: Store | null = null

/**
 * Upstash Redis when configured (Vercel's Upstash integration sets KV_REST_API_*;
 * a direct Upstash database uses UPSTASH_REDIS_REST_*), otherwise memory for local dev.
 */
export function getStore(): Store {
  if (store) return store
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (url && token) store = new RedisStore(url, token)
  else if (process.env.VERCEL) throw new Error('No Redis configured. Add the Upstash Redis integration to this Vercel project (Storage → Upstash).')
  else store = new MemoryStore()
  return store
}

export function setStore(s: Store) {
  store = s
}
