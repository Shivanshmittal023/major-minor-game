import { useCallback, useEffect, useState } from 'react'
import { cardLabel, setLabel } from '../engine/cards'
import { computeState, makeEvent, type GameState } from '../engine/game'
import { teamLabel, type GameEvent, type GameSetup, type NewEvent } from '../engine/types'

const STORAGE_KEY = 'major-minor-assistant/v1'

interface Persisted {
  setup: GameSetup | null
  events: GameEvent[]
  insights: Record<string, string[]>
}

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'trophy' | 'info'
  text: string
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Persisted
      return { setup: p.setup ?? null, events: p.events ?? [], insights: p.insights ?? {} }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { setup: null, events: [], insights: {} }
}

/** Rebuild state from storage, dropping any trailing events that no longer validate. */
function restore(p: Persisted): { state: GameState | null; events: GameEvent[] } {
  if (!p.setup) return { state: null, events: [] }
  let events = p.events
  for (;;) {
    const r = computeState(p.setup, events)
    if (r.ok) return { state: r.state, events }
    if (!events.length) return { state: null, events: [] }
    events = events.slice(0, Math.max(0, r.eventIndex))
  }
}

/** What did the latest event teach us, beyond the event itself? */
function diffInsights(prev: GameState, next: GameState, ev: GameEvent): string[] {
  const name = (p: number) => (p === next.setup.me ? 'you' : next.setup.players[p])
  const out: string[] = []
  const pk = prev.knowledge
  const nk = next.knowledge
  for (let c = 0; c < 48; c++) {
    const a = pk.cards[c]
    const b = nk.cards[c]
    if (ev.kind === 'ask' && ev.success && ev.card === c) continue
    if (b.status === 'known' && a.status !== 'known') out.push(`${cardLabel(c)} must be with ${name(b.owner!)}`)
    else if (b.status === 'uncertain' && b.team !== null && a.team === null)
      out.push(`${cardLabel(c)} is with ${teamLabel(b.team)} (${b.possible.map(name).join(' / ')})`)
  }
  nk.sets.forEach((s, i) => {
    if (s.completedBy !== null && pk.sets[i].completedBy === null) out.push(`${teamLabel(s.completedBy)} completed ${setLabel(i)}`)
  })
  return out
}

export function useGame() {
  const [initial] = useState(() => {
    const p = load()
    const r = restore(p)
    return { setup: r.state ? p.setup : null, events: r.events, state: r.state, insights: p.insights }
  })
  const [setup, setSetup] = useState<GameSetup | null>(initial.setup)
  const [state, setState] = useState<GameState | null>(initial.state)
  const [events, setEvents] = useState<GameEvent[]>(initial.events)
  const [redo, setRedo] = useState<GameEvent[]>([])
  const [insights, setInsights] = useState<Record<string, string[]>>(initial.insights)
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ setup, events, insights } satisfies Persisted))
    } catch {
      /* storage full or unavailable: the game still works in memory */
    }
  }, [setup, events, insights])

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-1), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'trophy' ? 6000 : 2200)
  }, [])

  const startGame = useCallback((s: GameSetup) => {
    const r = computeState(s, [])
    if (!r.ok) return r.error
    setSetup(s)
    setEvents([])
    setRedo([])
    setInsights({})
    setState(r.state)
    return null
  }, [])

  const commit = useCallback(
    (ev: GameEvent, clearRedo: boolean): string | null => {
      if (!setup || !state) return 'No game in progress.'
      const r = computeState(setup, [...events, ev])
      if (!r.ok) return r.error
      const found = diffInsights(state, r.state, ev)
      setEvents(r.state.events)
      setState(r.state)
      if (clearRedo) setRedo([])
      if (found.length) setInsights((m) => ({ ...m, [ev.id]: found }))
      r.state.knowledge.sets.forEach((s, i) => {
        const t = s.completedBy
        if (t !== null && state.knowledge.sets[i].completedBy === null) toast('trophy', `${teamLabel(t)} completed ${setLabel(i)}`)
      })
      return null
    },
    [setup, state, events, toast],
  )

  const addEvent = useCallback((ev: NewEvent) => commit(makeEvent(ev), true), [commit])

  const undo = useCallback(() => {
    if (!setup || !events.length) return
    const last = events[events.length - 1]
    const r = computeState(setup, events.slice(0, -1))
    if (!r.ok) return
    setEvents(r.state.events)
    setState(r.state)
    setRedo((x) => [...x, last])
    setInsights((m) => {
      const n = { ...m }
      delete n[last.id]
      return n
    })
    toast('info', 'Undid last event')
  }, [setup, events, toast])

  const redoLast = useCallback(() => {
    const ev = redo[redo.length - 1]
    if (!ev) return
    const err = commit(ev, false)
    if (!err) setRedo((x) => x.slice(0, -1))
  }, [redo, commit])

  const newGame = useCallback(() => {
    setSetup(null)
    setState(null)
    setEvents([])
    setRedo([])
    setInsights({})
  }, [])

  return {
    setup, state, events, insights, toasts, canRedo: redo.length > 0,
    startGame, addEvent, undo, redo: redoLast, newGame, toast,
  }
}

export type GameApi = ReturnType<typeof useGame>
