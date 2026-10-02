import { useCallback, useEffect, useMemo, useState } from 'react'
import { cardsOfSet, setLabel, setShortLabel } from '../engine/cards'
import type { GameState } from '../engine/game'
import { teamLabel, teamOf, type TeamId, setsOf } from '../engine/types'
import type { GameApi } from '../state/useGame'
import { CardTooltip } from './CardTooltip'
import { GameContext, setTeamNames, TEAM_STYLE, teamName, type Ctx } from './context'
import { EventComposer } from './EventComposer'
import { HistoryPanel } from './History'
import { Avatar, Button } from './kit'
import { MyHand } from './MyHand'
import { RecommendationPanel } from './Recommendation'
import { RecordSheet } from './RecordSheet'
import { SetTracker } from './SetTracker'
import { PlayerDrawer, PlayersPanel, type KnowledgeTab } from './TableView'

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" title="Back to Major–Minor online" className="flex items-center gap-3">
      <span className="relative h-8 w-7">
        <span className="card-back absolute inset-0 rotate-[-10deg] rounded-[4px]" style={{ ['--back' as string]: '#26365a' }} />
        <span className="paper absolute inset-0 flex rotate-[6deg] items-center justify-center rounded-[4px] text-sm text-inkcard">♠</span>
      </span>
      <div className={`leading-none ${compact ? 'hidden lg:block' : ''}`}>
        <div className="text-display text-[22px] text-fg">Major–Minor</div>
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-fg-4">Table assistant</div>
      </div>
    </a>
  )
}

export function Dashboard({ api, state }: { api: GameApi; state: GameState }) {
  const [hover, setHover] = useState<{ card: number; rect: DOMRect } | null>(null)
  const [drawer, setDrawer] = useState<number | null>(null)
  const [recording, setRecording] = useState<number | null>(null)
  const [tab, setTab] = useState<KnowledgeTab>('table')
  const { setup, knowledge: kn, timeline: tl } = state
  const myTeam = teamOf(setup.me)
  setTeamNames(setup.teamNames)
  const name = useCallback((p: number) => (p === setup.me ? 'You' : setup.players[p]), [setup])

  const hoverCard = useCallback((card: number | null, el?: HTMLElement | null) => {
    setHover(card === null || !el ? null : { card, rect: el.getBoundingClientRect() })
  }, [])
  const [composerRequest, setComposerRequest] = useState<Ctx['composerRequest']>(null)
  const layDown = useCallback(
    (set: number) => {
      const sk = state.knowledge.sets[set]
      const team = sk.heldBy
      if (team === null || sk.laidDownBy !== null) return
      const holders = cardsOfSet(set).map((c) => {
        const inTeam = state.knowledge.cards[c].possible.filter((p) => teamOf(p) === team)
        return inTeam.length === 1 ? inTeam[0] : -1
      })
      if (holders.every((h) => h >= 0)) {
        const err = api.addEvent({ kind: 'declare', team, set, holders })
        if (err) api.toast('error', err)
        return
      }
      // Some holders are only known at team level — ask who laid which card down.
      setComposerRequest({ mode: 'declare', set, nonce: Date.now() })
      api.toast('info', `Choose who held each card of ${setLabel(set)}`)
      document.getElementById('record-turn')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [api, state],
  )
  const ctx: Ctx = useMemo(
    () => ({ api, state, name, hoverCard, inspectPlayer: setDrawer, recordAsk: setRecording, layDown, composerRequest }),
    [api, state, name, hoverCard, layDown, composerRequest],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) api.redo()
        else api.undo()
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 't') setTab('table')
        else if (e.key === 'r') setTab('roster')
        else if (e.key === 'm') setTab('matrix')
        else if (e.key === 'Escape') {
          setDrawer(null)
          setRecording(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Tooltip anchors go stale when the state changes underneath them.
  useEffect(() => {
    setHover(null)
  }, [state])

  const score = (t: TeamId, reverse: boolean) => (
    <div className={`flex min-w-0 items-center gap-2 sm:gap-3 ${reverse ? 'flex-row-reverse text-left' : 'text-right'}`}>
      <div className="min-w-0 leading-tight">
        <div className={`max-w-[84px] truncate text-[12px] font-medium sm:max-w-none sm:text-[13px] ${TEAM_STYLE[t].text}`}>{teamName(t)}</div>
        <div className="text-[10px] text-fg-4">{t === myTeam ? 'you' : teamLabel(t)}</div>
      </div>
      <span className="text-display text-[28px] leading-none text-fg tabular-nums sm:text-[34px]">{kn.score[t]}</span>
    </div>
  )

  return (
    <GameContext.Provider value={ctx}>
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/85 backdrop-blur-md">
        <div className="mx-auto grid h-[60px] max-w-[1560px] grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:h-[68px] sm:gap-6 sm:px-6 lg:grid-cols-[1fr_auto_1fr]">
          <BrandMark compact />

          <div className="flex flex-col items-center gap-1.5" aria-label="Score, in sets">
            <div className="flex items-center gap-2.5 sm:gap-5">
              {score(0, false)}
              <span className="text-display text-2xl text-fg-4">:</span>
              {score(1, true)}
            </div>
            <div className="flex gap-1">
              {setsOf(state.setup).map((s) => {
                const by = kn.sets[s].completedBy
                return (
                  <span
                    key={s}
                    title={`${setShortLabel(s)}${by !== null ? ` · ${teamLabel(by)}` : ''}`}
                    className="h-1 w-2.5 rounded-full transition-colors duration-500 sm:w-4"
                    style={{ background: by === null ? 'rgb(255 255 255 / 0.08)' : TEAM_STYLE[by].hex }}
                  />
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
            <div className={`mr-2 hidden h-9 xl:flex items-center gap-2 rounded-full border pl-1 pr-3.5 text-[13px] ${tl.nextTurn === setup.me ? 'border-champagne/40 bg-champagne/[0.08] text-champagne' : 'border-white/[0.08] bg-white/[0.03] text-fg-2'}`}>
              <Avatar name={name(tl.nextTurn)} player={tl.nextTurn} size={26} />
              {tl.nextTurn === setup.me ? 'Your move' : `${setup.players[tl.nextTurn]} to play`}
            </div>
            <Button onClick={api.undo} disabled={!state.events.length} title="Undo (⌘Z)">
              Undo
            </Button>
            <Button
              variant="ghost"
              className="px-2 sm:px-3"
              onClick={() => {
                if (confirm('Start a new game? The current game will be discarded.')) api.newGame()
              }}
            >
              <span className="sm:hidden">New</span>
              <span className="hidden sm:inline">New game</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1560px] space-y-4 px-3 py-4 sm:space-y-5 sm:px-6 sm:py-6">
        <PlayersPanel tab={tab} onTab={setTab} />
        <div id="record-turn" className="scroll-mt-24">
          <EventComposer />
        </div>
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <SetTracker />
          <RecommendationPanel />
        </div>
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <MyHand />
          <HistoryPanel />
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 pb-2 pt-4 text-[11px] text-fg-4">
          <span className="hidden md:inline">
            Shortcuts: <span className="font-mono">/</span> quick entry · <span className="font-mono">Y N</span> outcome · <span className="font-mono">T R M</span> views · <span className="font-mono">⌘Z</span> undo
          </span>
          <span>Deductions are exact · percentages are estimates</span>
        </footer>
      </main>

      {hover && <CardTooltip card={hover.card} rect={hover.rect} />}
      {drawer !== null && <PlayerDrawer player={drawer} onClose={() => setDrawer(null)} />}
      {recording !== null && <RecordSheet target={recording} onClose={() => setRecording(null)} />}

      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end" aria-live="polite">
        {api.toasts.map((t) =>
          t.kind === 'trophy' ? (
            <div key={t.id} className="surface-raised foil animate-rise relative overflow-hidden rounded-xl border-champagne/35 px-5 py-3.5">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-champagne/80">Set completed</div>
              <div className="text-display mt-0.5 text-2xl text-fg">{t.text}</div>
            </div>
          ) : (
            <div key={t.id} className="surface-raised animate-rise flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-[13px] text-fg">
              <span className={`h-1.5 w-1.5 rounded-full ${t.kind === 'error' ? 'bg-rose' : 'bg-champagne'}`} />
              {t.text}
            </div>
          ),
        )}
      </div>
    </GameContext.Provider>
  )
}
