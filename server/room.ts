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
  hostId: string
  players: PlayerData[]
  seating: (string | null)[]
  phase: Phase
  game: Game | null
  version: number
  createdAt: number
  lastActivity: number
}

export type Presence = Record<string, number>

/** A player counts as online if their device polled within this window. */
export const ONLINE_MS = 15_000
/** Events sent to clients for animation. Older history stays server-side (it's a memory game). */
export const RECENT_EVENTS = 6
const HOST_AWAY_MS = 60_000
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

export function newRoom(code: string, host: PlayerData, now: number, size: TableSize = DEFAULT_SIZE): RoomData {
  return { code, size, hostId: host.id, players: [host], seating: new Array(size).fill(null), phase: 'lobby', game: null, version: 0, createdAt: now, lastActivity: now }
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
  return p
}

function removePlayer(r: RoomData, id: string) {
  r.players = r.players.filter((p) => p.id !== id)
  r.seating = r.seating.map((s) => (s === id ? null : s))
}

function passHost(r: RoomData, presence: Presence, now: number) {
  const next = r.players.find((p) => p.id !== r.hostId && !p.bot && isOnline(presence, p.id, now))
  if (next) r.hostId = next.id
}

/**
 * Apply one player action to a room (mutates `r`). Throws ActionError with a
 * player-facing message if the action isn't allowed. Returns false when the
 * action was a harmless no-op (e.g. a duplicate retry), so nothing is saved.
 */
export function reduce(r: RoomData, actor: PlayerData, msg: ClientMsg, presence: Presence, now: number): boolean {
  const isHost = r.hostId === actor.id
  const hostOnly = () => {
    if (!isHost) throw new ActionError('Only the host can do that.')
  }
  const lobbyOnly = (what: string) => {
    if (r.phase !== 'lobby') throw new ActionError(`${what} once the game has started.`)
  }

  switch (msg.type) {
    case 'leave': {
      if (r.phase === 'lobby') removePlayer(r, actor.id)
      if (r.hostId === actor.id) passHost(r, { ...presence, [actor.id]: 0 }, now)
      break
    }
    // Seating and teams are open to everyone in the lobby; starting and removing players stay with the host.
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
      hostOnly()
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
      hostOnly()
      lobbyOnly('Players can only be removed')
      if (msg.playerId === actor.id || !r.players.some((p) => p.id === msg.playerId)) throw new ActionError('Unknown player.')
      removePlayer(r, msg.playerId)
      break
    }
    case 'start': {
      hostOnly()
      if (r.phase !== 'lobby') throw new ActionError('The game has already started.')
      if (r.seating.some((id) => !id)) throw new ActionError(`Seat all ${r.size} players before starting.`)
      const offline = r.seating.filter((id) => !isOnline(presence, id!, now)).map((id) => r.players.find((p) => p.id === id)!.name)
      if (offline.length) throw new ActionError(`Waiting for ${offline.join(', ')} to reconnect.`)
      r.game = newGame(r.size)
      r.phase = r.game.winner === null ? 'playing' : 'finished'
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
    case 'skipTurn': {
      hostOnly()
      const g = r.game
      if (!g || r.phase !== 'playing') throw new ActionError('The game is not running.')
      const current = r.players.find((p) => p.id === r.seating[g.turn])
      if (current && isOnline(presence, current.id, now)) throw new ActionError(`${current.name} is online — it's their move.`)
      skipTurn(g)
      break
    }
    case 'backToLobby': {
      hostOnly()
      if (r.phase === 'lobby') return false
      r.phase = 'lobby'
      r.game = null
      // Anyone who has gone away gives up their seat for the rematch.
      for (const p of [...r.players]) if (p.id !== r.hostId && !isOnline(presence, p.id, now) && now - (presence[p.id] ?? p.joinedAt) > HOST_AWAY_MS) removePlayer(r, p.id)
      break
    }
    default:
      throw new ActionError('Unknown action.')
  }
  return true
}

/** Housekeeping done lazily on reads: hand over host from an absent host, drop long-gone lobby guests. */
export function maintain(r: RoomData, presence: Presence, now: number): boolean {
  let changed = false
  const hostSeen = presence[r.hostId] ?? r.createdAt
  if (now - hostSeen > HOST_AWAY_MS) {
    const before = r.hostId
    passHost(r, presence, now)
    changed ||= r.hostId !== before
  }
  if (r.phase === 'lobby')
    for (const p of [...r.players])
      if (p.id !== r.hostId && now - (presence[p.id] ?? p.joinedAt) > LOBBY_DROP_MS) {
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
    you: { id: me.id, name: me.name, isHost: r.hostId === me.id, seat: mySeat },
    teamNames: teamNamesOf(r),
    players: r.players.map((p) => ({ id: p.id, name: p.name, connected: isOnline(presence, p.id, now), isHost: p.id === r.hostId, seat: seatOf(r, p.id), bot: !!p.bot })),
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
