import { randomBytes, randomInt } from 'node:crypto'
import { CODE_LENGTH, MAX_LOBBY, NAME_MAX, type ClientMsg, type Phase, type Snapshot } from '../shared/protocol.js'
import { DEFAULT_SIZE, DEFAULT_TEAM_NAMES, TEAM_NAME_MAX, teamOfSeat, type TableSize } from '../shared/rules.js'
import { fillWithBots } from './bots.js'
import { ask, cardCount, declare, handOf, newGame, RuleError, score, skipTurn, type Game } from './game.js'

/**
 * A room as stored between requests (plain JSON), plus the pure functions that
 * change it. No I/O here: the HTTP handler loads a room, calls `reduce`, and saves.
 */

export interface PlayerData {
  id: string
  token: string
  name: string
  joinedAt: number
  /** Recently applied action ids, so a retried request is never applied twice. */
  seenActions: string[]
  /** A practice bot (see bots.ts). */
  bot?: true
}

export interface RoomData {
  code: string
  size: TableSize
  /** Chosen in the lobby; colours stay Tide-blue / Ember-copper. */
  teamNames?: [string, string]
  players: PlayerData[]
  seating: (string | null)[]
  phase: Phase
  game: Game | null
  /** Auto-start: when the table is full and everyone's online, deal at this time (ms). */
  autoStartAt?: number | null
  /** Someone cancelled the countdown: no auto-start until a player starts the game themselves. */
  autoStartCancelled?: boolean
  version: number
  createdAt: number
  lastActivity: number
}

export type Presence = Record<string, number>

/** A player counts as online if their device polled within this window. */
export const ONLINE_MS = 15_000
/** Events sent to clients for animation. Older history stays server-side (it's a memory game). */
export const RECENT_EVENTS = 6
const LOBBY_DROP_MS = 10 * 60_000

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

export class ActionError extends Error {
  fatal: boolean
  constructor(message: string, fatal = false) {
    super(message)
    this.fatal = fatal
  }
}

export function newCode(): string {
  let c = ''
  for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return c
}

export function newPlayer(name: string, now: number): PlayerData {
  return { id: randomBytes(8).toString('hex'), token: randomBytes(18).toString('base64url'), name, joinedAt: now, seenActions: [] }
}

export function newRoom(code: string, creator: PlayerData, now: number, size: TableSize = DEFAULT_SIZE): RoomData {
  // The creator simply takes the first seat — no special role.
  return { code, size, players: [creator], seating: [creator.id, ...new Array(size - 1).fill(null)], phase: 'lobby', game: null, version: 0, createdAt: now, lastActivity: now }
}

export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

export function normCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase().slice(0, 12) : ''
}

export const isOnline = (p: Presence, id: string, now: number) => now - (p[id] ?? 0) < ONLINE_MS

export function teamNamesOf(r: RoomData): [string, string] {
  return r.teamNames ?? [...DEFAULT_TEAM_NAMES]
}

const seatOf = (r: RoomData, id: string) => {
  const i = r.seating.indexOf(id)
  return i < 0 ? null : i
}

export function findByToken(r: RoomData, token: unknown): PlayerData | undefined {
  return typeof token === 'string' ? r.players.find((p) => p.token === token) : undefined
}

export function addPlayer(r: RoomData, name: string, now: number): PlayerData {
  if (r.phase !== 'lobby') throw new ActionError('That game has already started. Ask a seated player to share their link to rejoin.', true)
  if (r.players.length >= MAX_LOBBY) throw new ActionError('That lobby is full.', true)
  if (r.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new ActionError('Someone in this lobby already uses that name.')
  const p = newPlayer(name, now)
  r.players.push(p)
  // Take the first empty seat on arrival, so "everyone has joined" means the table is full.
  const free = r.seating.indexOf(null)
  if (free >= 0) r.seating[free] = p.id
  return p
}

function removePlayer(r: RoomData, id: string) {
  r.players = r.players.filter((p) => p.id !== id)
  r.seating = r.seating.map((s) => (s === id ? null : s))
}


/**
 * Apply one player action to a room (mutates `r`). Throws ActionError with a
 * player-facing message if the action isn't allowed. Returns false when the
 * action was a harmless no-op (e.g. a duplicate retry), so nothing is saved.
 */
export function reduce(r: RoomData, actor: PlayerData, msg: ClientMsg, presence: Presence, now: number): boolean {
  const lobbyOnly = (what: string) => {
    if (r.phase !== 'lobby') throw new ActionError(`${what} once the game has started.`)
  }

  switch (msg.type) {
    case 'leave': {
      if (r.phase === 'lobby') removePlayer(r, actor.id)
      break
    }
    // Everyone at the table is equal: seating, teams, bots, removing players and starting are open to all.
    case 'seat': {
      lobbyOnly("Seats can't change")
      if (!r.players.some((p) => p.id === msg.playerId)) throw new ActionError('Unknown player.')
      if (msg.seat !== null && (!Number.isInteger(msg.seat) || msg.seat < 0 || msg.seat >= r.size)) throw new ActionError('Unknown seat.')
      const from = seatOf(r, msg.playerId)
      if (msg.seat === null) {
        if (from !== null) r.seating[from] = null
      } else {
        const occupant = r.seating[msg.seat]
        r.seating[msg.seat] = msg.playerId
        if (from !== null && from !== msg.seat) r.seating[from] = occupant // swap
      }
      break
    }
    case 'autoSeat': {
      lobbyOnly("Seats can't change")
      const unseated = r.players.map((p) => p.id).filter((id) => seatOf(r, id) === null)
      r.seating = r.seating.map((id) => id ?? unseated.shift() ?? null)
      break
    }
    case 'shuffleSeats': {
      lobbyOnly("Seats can't change")
      const s = [...r.seating]
      for (let i = s.length - 1; i > 0; i--) {
        const j = randomInt(i + 1)
        ;[s[i], s[j]] = [s[j], s[i]]
      }
      r.seating = s
      break
    }
    case 'swapTeams': {
      lobbyOnly("Teams can't change")
      // Rotate one seat: every player keeps their neighbours but changes team.
      r.seating = r.seating.map((_, i) => r.seating[(i + 1) % r.size])
      break
    }
    case 'fillBots': {
      lobbyOnly('Bots can only join')
      // Seat whoever asked first (so a solo tester isn't left watching), then fill the rest with bots.
      if (seatOf(r, actor.id) === null) {
        const free = r.seating.indexOf(null)
        if (free >= 0) r.seating[free] = actor.id
      }
      if (!fillWithBots(r, now)) throw new ActionError('Every seat is already taken.')
      break
    }
    case 'teamName': {
      lobbyOnly("Team names can't change")
      if (msg.team !== 0 && msg.team !== 1) throw new ActionError('Unknown team.')
      const names = [...teamNamesOf(r)] as [string, string]
      const clean = cleanName(msg.name).slice(0, TEAM_NAME_MAX)
      const next = clean || DEFAULT_TEAM_NAMES[msg.team]
      if (next.toLowerCase() === names[1 - msg.team].toLowerCase()) throw new ActionError('The two teams need different names.')
      names[msg.team] = next
      r.teamNames = names
      break
    }
    case 'kick': {
      lobbyOnly('Players can only be removed')
      if (msg.playerId === actor.id || !r.players.some((p) => p.id === msg.playerId)) throw new ActionError('Unknown player.')
      removePlayer(r, msg.playerId)
      break
    }
    case 'start': {
      if (r.phase !== 'lobby') throw new ActionError('The game has already started.')
      if (r.seating.some((id) => !id)) throw new ActionError(`Seat all ${r.size} players before starting.`)
      const offline = r.seating.filter((id) => !isOnline(presence, id!, now)).map((id) => r.players.find((p) => p.id === id)!.name)
      if (offline.length) throw new ActionError(`Waiting for ${offline.join(', ')} to reconnect.`)
      deal(r)
      break
    }
    case 'cancelAutoStart': {
      if (r.phase !== 'lobby') throw new ActionError('The game has already started.')
      if (!r.autoStartAt && r.autoStartCancelled) return false
      r.autoStartAt = null
      r.autoStartCancelled = true
      break
    }
    case 'ask': {
      const g = r.game
      if (!g || r.phase !== 'playing') throw new ActionError('The game is not running.')
      if (typeof msg.actionId !== 'string' || msg.actionId.length > 64) throw new ActionError('Bad request.')
      if (actor.seenActions.includes(msg.actionId)) return false // duplicate delivery: already applied
      const seat = seatOf(r, actor.id)
      if (seat === null) throw new ActionError("You're watching this game, not playing.")
      try {
        ask(g, seat, msg.target, msg.card)
      } catch (e) {
        if (e instanceof RuleError) throw new ActionError(e.message)
        throw e
      }
      actor.seenActions = [...actor.seenActions.slice(-49), msg.actionId]
      if (g.winner !== null) r.phase = 'finished'
      break
    }
    case 'declare': {
      const g = r.game
      if (!g || r.phase !== 'playing') throw new ActionError('The game is not running.')
      if (typeof msg.actionId !== 'string' || msg.actionId.length > 64) throw new ActionError('Bad request.')
      if (actor.seenActions.includes(msg.actionId)) return false
      const seat = seatOf(r, actor.id)
      if (seat === null) throw new ActionError("You're watching this game, not playing.")
      try {
        declare(g, seat, msg.set, msg.holders)
      } catch (e) {
        if (e instanceof RuleError) throw new ActionError(e.message)
        throw e
      }
      actor.seenActions = [...actor.seenActions.slice(-49), msg.actionId]
      if (g.winner !== null) r.phase = 'finished'
      break
    }
    case 'backToLobby': {
      if (r.phase === 'lobby') return false
      r.phase = 'lobby'
      r.game = null
      // Anyone who has gone away gives up their seat for the rematch.
      for (const p of [...r.players]) if (!p.bot && !isOnline(presence, p.id, now) && now - (presence[p.id] ?? p.joinedAt) > 60_000) removePlayer(r, p.id)
      break
    }
    default:
      throw new ActionError('Unknown action.')
  }
  return true
}

function deal(r: RoomData) {
  r.game = newGame(r.size)
  r.phase = r.game.winner === null ? 'playing' : 'finished'
  r.autoStartAt = null
  r.autoStartCancelled = false
}

export const AUTO_START_MS = 10_000

const tableReady = (r: RoomData, presence: Presence, now: number) => r.seating.every((id) => id && isOnline(presence, id, now))

/**
 * Auto-start, evaluated lazily on polls (like bots): the moment every seat is
 * filled and everyone is online, a 10-second countdown starts (shown to everyone
 * as a pop-up); when it runs out the cards are dealt. If a seat empties or someone
 * drops offline, it disarms. Anyone can "Start now" — or "Cancel", which keeps it
 * off so people can rearrange, until someone starts the game. Returns true if changed.
 */
export function autoStart(r: RoomData, presence: Presence, now: number): boolean {
  if (r.phase !== 'lobby') return false
  const ready = !r.autoStartCancelled && r.seating.every(Boolean) && tableReady(r, presence, now)
  if (!ready) {
    if (r.autoStartAt) {
      r.autoStartAt = null
      return true
    }
    return false
  }
  if (!r.autoStartAt) {
    r.autoStartAt = now + AUTO_START_MS
    return true
  }
  if (now >= r.autoStartAt) {
    deal(r)
    return true
  }
  return false
}

/** A disconnected player's turn is skipped automatically after this long, so a table never stalls. */
export const AUTO_SKIP_MS = 60_000

/** Lazily (on polls): if the player to move is offline and the turn has waited a minute, move on. */
export function autoSkip(r: RoomData, presence: Presence, now: number): boolean {
  const g = r.game
  if (!g || r.phase !== 'playing' || g.winner !== null) return false
  const p = r.players.find((x) => x.id === r.seating[g.turn])
  if (!p || p.bot || isOnline(presence, p.id, now)) return false
  const last = g.log[g.log.length - 1]
  if (now - (last?.t ?? 0) < AUTO_SKIP_MS) return false
  skipTurn(g, 'away')
  return true
}

/** Housekeeping done lazily on reads: drop lobby guests who closed the tab long ago. */
export function maintain(r: RoomData, presence: Presence, now: number): boolean {
  let changed = false
  if (r.phase === 'lobby')
    for (const p of [...r.players])
      if (!p.bot && now - (presence[p.id] ?? p.joinedAt) > LOBBY_DROP_MS) {
        removePlayer(r, p.id)
        changed = true
      }
  return changed
}

/** The view one player is allowed to see: public table + ONLY their own hand. */
export function snapshotFor(r: RoomData, playerId: string, presence: Presence, now: number): Snapshot {
  const me = r.players.find((p) => p.id === playerId)!
  const g = r.game
  const mySeat = seatOf(r, playerId)
  return {
    code: r.code,
    size: r.size,
    phase: r.phase,
    version: r.version,
    you: { id: me.id, name: me.name, seat: mySeat },
    teamNames: teamNamesOf(r),
    autoStart: r.phase === 'lobby' ? { at: r.autoStartAt ?? null, now, cancelled: !!r.autoStartCancelled } : null,
    players: r.players.map((p) => ({ id: p.id, name: p.name, connected: isOnline(presence, p.id, now), seat: seatOf(r, p.id), bot: !!p.bot })),
    seating: [...r.seating],
    game: g
      ? {
          seats: r.seating.map((id, seat) => {
            const p = r.players.find((x) => x.id === id)
            return { seat, playerId: id ?? '', name: p?.name ?? 'Empty seat', team: teamOfSeat(seat), cardCount: cardCount(g, seat), connected: !!p && isOnline(presence, p.id, now), bot: !!p?.bot }
          }),
          turn: g.turn,
          completed: [...g.completed],
          score: score(g),
          recent: g.log.slice(-RECENT_EVENTS),
          askCount: g.log.filter((e) => e.kind === 'ask').length,
          winner: g.winner,
        }
      : null,
    hand: g && mySeat !== null ? handOf(g, mySeat) : null,
  }
}

/** Cheap change detector: the snapshot only changes when the room or anyone's online status does. */
export function etagFor(r: RoomData, presence: Presence, now: number): string {
  const online = r.players.filter((p) => isOnline(presence, p.id, now)).map((p) => p.id).sort().join(',')
  let h = 2166136261
  for (let i = 0; i < online.length; i++) h = Math.imul(h ^ online.charCodeAt(i), 16777619)
  return `${r.version}.${(h >>> 0).toString(36)}`
}

export type { Game }
