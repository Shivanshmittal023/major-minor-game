import { cardLabel, setLabel } from '../engine/cards'
import type { GameEvent, GameSetup } from '../engine/types'
import { teamLabel } from '../engine/types'

export function playerName(setup: GameSetup, p: number): string {
  return p === setup.me ? 'You' : setup.players[p]
}

export function describeEvent(setup: GameSetup, ev: GameEvent): { title: string; result: string; ok: boolean | null } {
  const n = (p: number) => playerName(setup, p)
  if (ev.kind === 'ask') {
    return {
      title: `${n(ev.requester)} → ${n(ev.target)}: asked for ${cardLabel(ev.card)}`,
      result: ev.success
        ? `${n(ev.target)} had it → ${cardLabel(ev.card)} to ${n(ev.requester)}`
        : `${n(ev.target)} didn't have ${cardLabel(ev.card)}`,
      ok: ev.success,
    }
  }
  if (ev.kind === 'declare') {
    return { title: `${teamLabel(ev.team)} laid down ${setLabel(ev.set)}`, result: 'Set completed', ok: null }
  }
  return {
    title: `Observed: ${n(ev.player)} ${ev.has ? 'has' : "doesn't have"} ${cardLabel(ev.card)}`,
    result: ev.note ?? '',
    ok: null,
  }
}

/** Human-readable "why is this ruled out" for a card/player pair. */
export function exclusionReason(setup: GameSetup, events: GameEvent[], ev: number): string {
  if (ev === -2) return 'not in your hand'
  if (ev === -3) return 'ruled out by elimination (hand sizes / other constraints)'
  const e = events[ev]
  if (!e) return ''
  const turn = `turn ${ev + 1}`
  if (e.kind === 'ask') {
    return `${turn}: ${playerName(setup, e.requester)} asked ${playerName(setup, e.target)} for ${cardLabel(e.card)}`
  }
  if (e.kind === 'fact') return `${turn}: observed`
  return turn
}

export function pct(x: number): string {
  if (x >= 0.995) return '100%'
  if (x > 0 && x < 0.01) return '<1%'
  return `${Math.round(x * 100)}%`
}
