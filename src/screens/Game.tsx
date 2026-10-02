import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { setShortLabel, type SetId } from '../../shared/cards'
import type { Snapshot } from '../../shared/protocol'
import { teamLabel, type TeamId } from '../../shared/rules'
import { navigate } from '../App'
import { AskPanel, AskSheet } from '../game/AskPanel'
import { declarableSets, DeclarePanel, DeclareSheet } from '../game/Declare'
import { Hand } from '../game/Hand'
import { EndOverlay, SetsBoard } from '../game/Sidebar'
import { Banner, Table } from '../game/Table'
import { makeView, useLogEffects } from '../game/view'
import { client } from '../net/client'
import { Avatar, BrandMark, Button, TEAM_STYLE, useMediaQuery, teamName } from '../ui/kit'

export function GameScreen({ snap }: { snap: Snapshot }) {
  const v = useMemo(() => makeView(snap), [snap])
  const compact = !useMediaQuery('(min-width: 1024px)')
  const fx = useLogEffects(v, compact)
  // Asking is seat-first: tap an opponent → their valid cards → tap one.
  const [askTarget, setAskTarget] = useState<number | null>(null)
  const [focusSet, setFocusSet] = useState<SetId | null>(null)
  const [declaring, setDeclaring] = useState(false)

  // A nudge when it becomes your turn: tab title + a short vibration on phones.
  const wasMyTurn = useRef(v.myTurn)
  useEffect(() => {
    document.title = v.myTurn ? '● Your move · Major–Minor' : 'Major–Minor'
    if (v.myTurn && !wasMyTurn.current) navigator.vibrate?.(40)
    wasMyTurn.current = v.myTurn
  }, [v.myTurn])
  useEffect(() => () => void (document.title = 'Major–Minor'), [])

  const closeDeclare = useCallback(() => setDeclaring(false), [])
  const closeAsk = useCallback(() => setAskTarget(null), [])
  const sheets = (
    <>
      {askTarget !== null && <AskSheet v={v} target={askTarget} focusSet={focusSet} onClose={closeAsk} />}
      {declaring && v.me !== null && <DeclareSheet v={v} initialSet={focusSet} onClose={closeDeclare} />}
    </>
  )

  const header = (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/85 backdrop-blur-md">
      <div className="mx-auto grid h-[60px] max-w-[1560px] grid-cols-[auto_1fr_auto] items-center gap-3 px-3 sm:h-[68px] sm:grid-cols-[1fr_auto_1fr] sm:gap-6 sm:px-6">
        <BrandMark compact={compact} iconOnly={compact} />
        <Score v={v} compact={compact} />
        <div className="flex items-center justify-end gap-2">
          {!compact && snap.phase === 'finished' && <span className="mr-1 text-[13px] text-fg-3">Game over</span>}
          {!compact && snap.phase === 'playing' && (
            <div className={`mr-1 flex h-9 items-center gap-2 rounded-full border pl-1 pr-3.5 text-[13px] ${v.myTurn ? 'border-champagne/40 bg-champagne/[0.08] text-champagne' : 'border-white/[0.08] bg-white/[0.03] text-fg-2'}`}>
              <Avatar name={v.nameOf(v.g.turn)} team={(v.g.turn % 2) as TeamId} size={26} />
              {v.myTurn ? 'Your move' : `${v.g.seats[v.g.turn].name} to play`}
            </div>
          )}
          <span className="hidden font-mono text-[11px] tracking-[0.2em] text-fg-4 md:inline">{snap.code}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm('Leave the game? Your seat stays reserved — reopen the link to come back.')) {
                client.leave(true)
                navigate('/')
              }
            }}
          >
            Leave
          </Button>
        </div>
      </div>
    </header>
  )

  if (compact) {
    const canDeclare = v.snap.phase === 'playing' && declarableSets(v).length > 0
    return (
      <div className="min-h-screen pb-[164px]">
        {header}
        <main className="space-y-2.5 px-2.5 py-2.5">
          <section className="surface overflow-hidden rounded-2xl">
            <Table v={v} fx={fx} compact picking={v.myTurn} target={askTarget} onTarget={setAskTarget} />
            {fx.banner && (
              <div className="border-t border-white/[0.05] px-3 py-2.5">
                <Banner v={v} fx={fx} inline />
              </div>
            )}
          </section>
          <AskPanel v={v} onPick={setAskTarget} compact />
          <SetsBoard v={v} compact />
        </main>
        {v.me !== null && (
          <div
            className={`pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-ink-900/95 px-2 pt-2 backdrop-blur-md transition-colors duration-500 ${
              v.myTurn ? 'border-champagne/40 shadow-[0_-12px_40px_-12px_rgba(230,210,162,0.35)]' : 'border-white/[0.07]'
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-2 px-1.5">
              <div className="min-w-0 text-[11px]">
                {v.myTurn ? (
                  <span className="font-semibold text-champagne">Your move · tap an opponent</span>
                ) : snap.phase === 'playing' ? (
                  <span className="text-fg-3">
                    <span className="text-fg-2">{v.g.seats[v.g.turn].name}</span> to play
                  </span>
                ) : (
                  <span className="text-fg-3">Game over</span>
                )}
                <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-4">· {v.hand.length} cards</span>
              </div>
              {snap.phase === 'playing' && (
                <button
                  type="button"
                  disabled={!canDeclare}
                  onClick={() => setDeclaring(true)}
                  className="h-7 shrink-0 rounded-full border border-champagne/40 px-3 text-[11px] font-medium text-champagne transition-colors active:bg-champagne/10 disabled:border-white/10 disabled:text-fg-4"
                >
                  Declare…
                </button>
              )}
            </div>
            <Hand v={v} compact focusSet={focusSet} onFocusSet={setFocusSet} />
          </div>
        )}
        {sheets}
        <EndOverlay v={v} />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {header}
      <main className="mx-auto grid max-w-[1560px] grid-cols-[minmax(0,1fr)_400px] items-start gap-5 px-6 py-6">
        <div className="min-w-0 space-y-5">
          <section className="surface relative overflow-hidden rounded-2xl">
            <header className="flex items-end justify-between px-6 pb-1 pt-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-4">Live table · {snap.code}</div>
                <h1 className="text-display mt-1 text-[28px] leading-none text-fg">
                  {snap.phase === 'finished' ? 'Game over.' : v.myTurn ? 'Your move.' : `${v.g.seats[v.g.turn].name} is up.`}
                </h1>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-fg-4">
                {([0, 1] as TeamId[]).map((t) => (
                  <span key={t} className={`flex items-center gap-1.5 ${TEAM_STYLE[t].text}`}>
                    <span className="h-[3px] w-4 rounded-full" style={{ background: TEAM_STYLE[t].hex }} /> {teamName(t)}
                  </span>
                ))}
              </div>
            </header>
            <Table v={v} fx={fx} compact={false} picking={v.myTurn} target={askTarget} onTarget={setAskTarget} />
            {v.me !== null && (
              <div className="border-t border-white/[0.05] bg-black/15 px-6 pb-4 pt-3">
                <Hand v={v} compact={false} focusSet={focusSet} onFocusSet={setFocusSet} />
              </div>
            )}
          </section>
        </div>
        <aside className="space-y-5">
          <AskPanel v={v} onPick={setAskTarget} />
          <DeclarePanel v={v} onOpen={() => setDeclaring(true)} />
          <SetsBoard v={v} />
        </aside>
      </main>
      {sheets}
      <EndOverlay v={v} />
    </div>
  )
}

function Score({ v, compact }: { v: ReturnType<typeof makeView>; compact: boolean }) {
  const myTeam = v.me === null ? null : ((v.me % 2) as TeamId)
  const side = (t: TeamId, reverse: boolean) => (
    <div className={`flex items-center gap-2 sm:gap-3 ${reverse ? 'flex-row-reverse text-left' : 'text-right'}`}>
      <div className="leading-tight">
        <div className={`max-w-[76px] truncate text-xs font-medium sm:max-w-none sm:text-[13px] ${TEAM_STYLE[t].text}`} title={teamName(t)}>{teamName(t)}</div>
        {!compact && <div className="text-[10px] text-fg-4">{teamLabel(t)}{t === myTeam ? ' · you' : ''}</div>}
      </div>
      <span className={`text-display leading-none text-fg tabular-nums ${compact ? 'text-[26px]' : 'text-[34px]'}`}>{v.g.score[t]}</span>
    </div>
  )
  return (
    <div className="flex flex-col items-center gap-1" aria-label="Score, in sets">
      <div className="flex items-center gap-3 sm:gap-5">
        {side(0, false)}
        <span className="text-display text-xl text-fg-4 sm:text-2xl">:</span>
        {side(1, true)}
      </div>
      <div className="flex gap-1">
        {v.sets.map((s) => {
          const by = v.g.completed[s]
          return (
            <span
              key={s}
              title={setShortLabel(s)}
              className="h-1 w-3 rounded-full transition-colors duration-500 sm:w-4"
              style={{ background: by === null ? 'rgb(255 255 255 / 0.08)' : TEAM_STYLE[by].hex }}
            />
          )
        })}
      </div>
    </div>
  )
}

