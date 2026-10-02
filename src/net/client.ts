import { useSyncExternalStore } from 'react'
import type { CardId } from '../../shared/cards'
import type { ClientMsg, Snapshot } from '../../shared/protocol'
import type { TableSize } from '../../shared/rules'

/**
 * Talks to the serverless game API. Every device polls its own view of the room
 * (about once a second while visible); actions are POSTed and answered with the
 * fresh snapshot immediately. A stored session token means refreshing, locking
 * the phone or losing signal never costs anyone their seat.
 */

export type ConnStatus = 'connecting' | 'open' | 'reconnecting'

export interface ClientState {
  status: ConnStatus
  snapshot: Snapshot | null
  /** Unrecoverable problem for this room (not found, removed…). */
  fatal: string | null
  toasts: { id: number; message: string; tone: 'error' | 'info' }[]
  pendingAsk: string | null
}

interface Reply {
  snapshot?: Snapshot
  etag?: string
  welcome?: { code: string; token: string; playerId: string }
  unchanged?: true
  error?: string
  fatal?: boolean
}

const API = '/api/room'
const SESSIONS_KEY = 'mm-game/sessions'
const NAME_KEY = 'mm-game/name'
const POLL_VISIBLE_MS = 1000 // during a game
const POLL_LOBBY_MS = 2000
const POLL_HIDDEN_MS = 4000

type Sessions = Record<string, { token: string; playerId: string }>

function readSessions(): Sessions {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function writeSessions(s: Sessions) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(s))
  } catch {
    /* private mode: sessions just won't survive a refresh */
  }
}

export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function hasSession(code: string): boolean {
  return !!readSessions()[code.toUpperCase()]
}

class RoomClient {
  private listeners = new Set<() => void>()
  private code: string | null = null
  private etag = ''
  private timer: number | null = null
  private polling = false
  private failures = 0
  private pendingActionId: string | null = null
  state: ClientState = { status: 'open', snapshot: null, fatal: null, toasts: [], pendingAsk: null }

  constructor() {
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.pollNow()
      })
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private set(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  private session() {
    return this.code ? readSessions()[this.code] : undefined
  }

  // ---------------------------------------------------------------- transport

  private async request(method: 'GET' | 'POST', body?: object, query = ''): Promise<Reply> {
    const res = await fetch(API + query, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
    return (await res.json().catch(() => ({ error: 'Unexpected server response.' }))) as Reply
  }

  private absorb(r: Reply): boolean {
    if (r.welcome) {
      this.code = r.welcome.code
      const s = readSessions()
      s[r.welcome.code] = { token: r.welcome.token, playerId: r.welcome.playerId }
      writeSessions(s)
    }
    if (r.error) {
      if (r.fatal) {
        if (this.code) {
          const s = readSessions()
          delete s[this.code]
          writeSessions(s)
        }
        this.stopPolling()
        this.set({ fatal: r.error, snapshot: null })
      } else this.toast(r.error, 'error')
      return false
    }
    // A poll sent before one of our actions can land after it; never let an older room version overwrite a newer one.
    const cur = this.state.snapshot
    if (r.snapshot && cur && cur.code === r.snapshot.code && r.snapshot.version < cur.version) return true
    if (r.etag) this.etag = r.etag
    if (r.snapshot) this.set({ snapshot: r.snapshot, fatal: null })
    return true
  }

  private async poll() {
    this.timer = null
    const s = this.session()
    if (!this.code || !s) return
    if (this.polling) return this.schedule()
    this.polling = true
    try {
      const q = `?code=${encodeURIComponent(this.code)}&token=${encodeURIComponent(s.token)}&etag=${encodeURIComponent(this.etag)}`
      const r = await this.request('GET', undefined, q)
      this.failures = 0
      if (this.state.status !== 'open') this.set({ status: 'open' })
      this.absorb(r)
    } catch {
      if (++this.failures >= 2) this.set({ status: 'reconnecting' })
    } finally {
      this.polling = false
      if (!this.state.fatal) this.schedule()
    }
  }

  private schedule() {
    if (this.timer !== null || !this.code) return
    const hidden = typeof document !== 'undefined' && document.hidden
    const snap = this.state.snapshot
    const busy = snap?.phase === 'playing' || !!snap?.autoStart?.at // poll faster during play and auto-start countdowns
    const delay = hidden ? POLL_HIDDEN_MS : busy ? POLL_VISIBLE_MS : POLL_LOBBY_MS
    this.timer = window.setTimeout(() => this.poll(), this.failures ? Math.min(5000, 1000 * this.failures) : delay)
  }

  private pollNow() {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    void this.poll()
  }

  private stopPolling() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  /** Send an action; retries network failures (the server de-duplicates asks by actionId). */
  private async act(msg: ClientMsg): Promise<boolean> {
    const s = this.session()
    const body = { code: this.code ?? undefined, token: s?.token, msg }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await this.request('POST', body)
        if (this.state.status !== 'open') this.set({ status: 'open' })
        return this.absorb(r)
      } catch {
        this.set({ status: 'reconnecting' })
        await new Promise((res) => setTimeout(res, 600 * (attempt + 1)))
      }
    }
    this.toast("Couldn't reach the table. Check your connection and try again.", 'error')
    return false
  }

  toast(message: string, tone: 'error' | 'info' = 'info') {
    const id = Date.now() + Math.random()
    this.set({ toasts: [...this.state.toasts.slice(-2), { id, message, tone }] })
    setTimeout(() => this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) }), 3200)
  }

  // ---------------------------------------------------------------- public API

  connect() {
    /* HTTP needs no persistent connection; kept so callers don't depend on the transport. */
  }

  /** Point the client at a room (from the URL). Resumes automatically if we have a session. */
  enterRoom(code: string) {
    const c = code.toUpperCase()
    if (this.code === c && this.state.snapshot) return
    this.code = c
    this.etag = ''
    this.set({ fatal: null, snapshot: null })
    this.pollNow()
  }

  async create(name: string, size: TableSize) {
    this.remember(name)
    this.code = null
    if (await this.act({ type: 'create', name, size })) this.pollNow()
  }
  async join(code: string, name: string) {
    this.remember(name)
    this.code = code.toUpperCase()
    if (await this.act({ type: 'join', code: this.code, name })) this.pollNow()
  }
  /** Leave the table. Mid-game, `keepSeat` keeps the session so reopening the link resumes your seat. */
  leave(keepSeat = false) {
    const code = this.code
    if (code && !keepSeat) void this.act({ type: 'leave' })
    this.stopPolling()
    if (code && !keepSeat) {
      const s = readSessions()
      delete s[code]
      writeSessions(s)
    }
    this.code = null
    this.etag = ''
    this.set({ snapshot: null, fatal: null })
  }
  seat(playerId: string, seat: number | null) {
    void this.act({ type: 'seat', playerId, seat })
  }
  autoSeat() {
    void this.act({ type: 'autoSeat' })
  }
  shuffleSeats() {
    void this.act({ type: 'shuffleSeats' })
  }
  swapTeams() {
    void this.act({ type: 'swapTeams' })
  }
  fillBots() {
    void this.act({ type: 'fillBots' })
  }
  teamName(team: 0 | 1, name: string) {
    void this.act({ type: 'teamName', team, name })
  }
  kick(playerId: string) {
    void this.act({ type: 'kick', playerId })
  }
  start() {
    void this.act({ type: 'start' })
  }
  cancelAutoStart() {
    void this.act({ type: 'cancelAutoStart' })
  }
  async ask(target: number, card: CardId) {
    if (this.pendingActionId) return
    const actionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    this.pendingActionId = actionId
    this.set({ pendingAsk: actionId })
    await this.act({ type: 'ask', target, card, actionId })
    this.pendingActionId = null
    this.set({ pendingAsk: null })
  }
  async declare(set: number, holders: number[]): Promise<boolean> {
    if (this.pendingActionId) return false
    const actionId = `${Date.now().toString(36)}-d${Math.random().toString(36).slice(2, 8)}`
    this.pendingActionId = actionId
    this.set({ pendingAsk: actionId })
    const ok = await this.act({ type: 'declare', set, holders, actionId })
    this.pendingActionId = null
    this.set({ pendingAsk: null })
    return ok
  }
  backToLobby() {
    void this.act({ type: 'backToLobby' })
  }

  private remember(name: string) {
    try {
      localStorage.setItem(NAME_KEY, name)
    } catch {
      /* ignore */
    }
  }
}

export const client = new RoomClient()

export function useClient(): ClientState {
  return useSyncExternalStore(client.subscribe, () => client.state)
}
