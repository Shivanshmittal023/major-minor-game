import { useEffect, useRef, useState } from 'react'
import { cardShort, cardsOfSet, EXTRA_SET, isRedSet, setGlyph, setKind, setLabel, type SetId } from '../../shared/cards'
import type { LogEntry } from '../../shared/protocol'
import { teamLabel, type TeamId } from '../../shared/rules'
import { navigate } from '../App'
import { client } from '../net/client'
import { Badge, Button, Panel, TEAM_STYLE, TeamDot } from '../ui/kit'
import type { View } from './view'

/** Public set status: who completed what, plus which cards of each set you hold. */
export function SetsBoard({ v }: { v: View }) {
  const done = v.g.completed.filter((t) => t !== null).length
  const held = new Set(v.hand)
  return (
    <Panel eyebrow="Sets" title="Set progress" meta={`${done} of ${v.sets.length} complete`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        {v.sets.map((s) => (
          <SetTile key={s} s={s} team={v.g.completed[s]} mine={cardsOfSet(s).filter((c) => held.has(c)).length} />
        ))}
      </div>
    </Panel>
  )
}

function SetTile({ s, team, mine }: { s: SetId; team: TeamId | null; mine: number }) {
  const red = isRedSet(s)
  const extra = s === EXTRA_SET
  const prev = useRef(team)
  const [celebrate, setCelebrate] = useState(false)
  useEffect(() => {
    if (prev.current === null && team !== null) {
      setCelebrate(true)
      const t = setTimeout(() => setCelebrate(false), 1600)
      prev.current = team
      return () => clearTimeout(t)
    }
    prev.current = team
  }, [team])
  const style = team !== null ? { borderColor: `rgb(${TEAM_STYLE[team].rgb} / 0.35)`, background: `linear-gradient(180deg, rgb(${TEAM_STYLE[team].rgb} / 0.08), transparent 75%)` } : undefined
  return (
    <div className={`relative overflow-hidden rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 ${extra ? 'col-span-2 sm:col-span-4 lg:col-span-2' : ''} ${celebrate ? 'foil' : ''}`} style={style}>
      <div className="flex items-center justify-between">
        <span className="flex items-baseline gap-1.5">
          <span className={`text-display text-xl leading-none ${red ? 'text-rose' : extra ? 'text-champagne' : 'text-fg'}`}>{setGlyph(s)}</span>
          <span className="text-xs text-fg">{setKind(s)}</span>
          {extra && <span className="text-[10px] text-fg-4">8♠ 8♥ 8♦ 8♣ · 2 Jokers</span>}
        </span>
        {team !== null ? <Badge tone={team === 0 ? 'team0' : 'team1'}>{TEAM_STYLE[team].name}</Badge> : <span className="font-mono text-[10px] text-fg-4">in play</span>}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className="h-[3px] flex-1 rounded-full"
            style={{ background: team !== null ? TEAM_STYLE[team].hex : i < mine ? '#e6d2a2' : 'rgb(255 255 255 / 0.07)', opacity: team !== null ? 0.8 : 1 }}
          />
        ))}
      </div>
      <div className="mt-1 text-[10px] text-fg-4">{team !== null ? `Won by ${teamLabel(team)}` : mine ? `You hold ${mine}` : 'You hold none'}</div>
    </div>
  )
}

function describe(v: View, e: LogEntry): { title: React.ReactNode; detail?: React.ReactNode; tone: 'good' | 'bad' | 'accent' | 'neutral' } {
  const n = v.nameOf
  switch (e.kind) {
    case 'start':
      return { title: 'Cards dealt — 6 each', detail: `${n(e.first)} ${e.first === v.me ? 'go' : 'goes'} first`, tone: 'accent' }
    case 'ask':
      return {
        title: (
          <>
            {n(e.asker)} → {e.target === v.me ? 'you' : n(e.target)} <span className="text-fg-3">for</span> {cardShort(e.card)}
          </>
        ),
        detail: e.success ? `${e.target === v.me ? 'You' : n(e.target)} handed it over` : `${e.target === v.me ? "You didn't" : `${n(e.target)} didn't`} have it`,
        tone: e.success ? 'good' : 'bad',
      }
    case 'declare': {
      const wrong = e.claimed.map((h, i) => (h === e.actual[i] ? null : cardShort(cardsOfSet(e.set)[i]))).filter(Boolean)
      return {
        title: `${n(e.declarer)} declared ${setLabel(e.set)}`,
        detail: e.correct ? `Correct — ${TEAM_STYLE[e.team].name} win the set` : `Wrong on ${wrong.join(' ')} — ${TEAM_STYLE[e.team].name} take the set`,
        tone: e.correct ? 'good' : 'bad',
      }
    }
    case 'skip':
      return { title: `${n(e.from)} skipped`, detail: e.reason === 'no-cards' ? `No cards left — ${n(e.to)} plays` : `Skipped by the host — ${n(e.to)} plays`, tone: 'neutral' }
    case 'end':
      return { title: e.winner === 'draw' ? 'Game drawn' : `${TEAM_STYLE[e.winner].name} win`, detail: `${e.score[0]} – ${e.score[1]}`, tone: 'accent' }
  }
}

export function GameLog({ v, className = '' }: { v: View; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const len = v.g.log.length
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [len])
  return (
    <section className={`surface flex min-h-0 flex-col rounded-xl ${className}`}>
      <header className="flex min-h-12 shrink-0 items-center border-b border-white/[0.05] px-4 py-2.5 sm:px-5">
        <div>
          <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Log</div>
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-[13px] font-semibold text-fg">Game history</h2>
            <span className="text-xs text-fg-3">{v.g.log.filter((e) => e.kind === 'ask').length} asks</span>
          </div>
        </div>
      </header>
      <div ref={ref} className="max-h-[360px] min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
        <ol className="relative">
          {len > 1 && <span className="absolute bottom-3 left-[11px] top-3 w-px bg-white/[0.06]" />}
          {v.g.log.map((e, i) => {
            const d = describe(v, e)
            const dot = { good: 'bg-sage', bad: 'bg-rose', accent: 'bg-champagne', neutral: 'bg-fg-4' }[d.tone]
            return (
              <li key={e.id} className={`relative flex gap-3.5 py-1.5 ${i === len - 1 ? 'animate-rise' : ''}`}>
                <span className="relative z-10 mt-[2px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-ink-850">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-fg">{d.title}</div>
                  {d.detail && <div className={`text-xs ${d.tone === 'good' ? 'text-sage/90' : d.tone === 'bad' ? 'text-rose/90' : 'text-fg-3'}`}>{d.detail}</div>}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

export function EndOverlay({ v }: { v: View }) {
  const [hidden, setHidden] = useState(false)
  if (v.snap.phase !== 'finished' || hidden) return null
  const w = v.g.winner
  const myTeam = v.me === null ? null : ((v.me % 2) as TeamId)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="surface-raised animate-rise relative w-full max-w-lg overflow-hidden rounded-2xl p-6 sm:p-8">
        {w !== null && w !== 'draw' && (
          <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(520px 260px at 50% 0%, rgb(${TEAM_STYLE[w].rgb} / 0.2), transparent 70%)` }} />
        )}
        <div className="relative text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-4">Game over</div>
          <h2 className="text-display mt-2 text-[52px] leading-none text-fg">
            {w === 'draw' ? 'A draw.' : <><span className={TEAM_STYLE[w!].text}>{TEAM_STYLE[w!].name}</span> win.</>}
          </h2>
          {myTeam !== null && w !== 'draw' && <p className="mt-2 text-sm text-fg-2">{w === myTeam ? 'Your team took the table.' : 'Well played — next time.'}</p>}
          <div className="mt-6 flex items-center justify-center gap-6">
            {([0, 1] as TeamId[]).map((t) => (
              <div key={t} className="text-center">
                <div className="text-display text-[56px] leading-none text-fg">{v.g.score[t]}</div>
                <div className={`mt-1 flex items-center justify-center gap-1.5 text-xs ${TEAM_STYLE[t].text}`}>
                  <TeamDot team={t} /> {TEAM_STYLE[t].name}
                </div>
                <div className="mt-2 flex justify-center gap-1">
                  {v.sets.filter((s) => v.g.completed[s] === t).map((s) => (
                    <span key={s} title={setLabel(s)} className={`paper flex h-7 w-5 items-center justify-center rounded-[3px] text-[11px] ${isRedSet(s) ? 'text-crimson' : 'text-inkcard'}`}>
                      {setGlyph(s)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {v.snap.you.isHost ? (
              <Button variant="primary" size="lg" onClick={() => client.backToLobby()}>
                Back to lobby for a rematch
              </Button>
            ) : (
              <span className="self-center text-xs text-fg-3">The host can start a rematch.</span>
            )}
            <Button size="lg" onClick={() => setHidden(true)}>
              View table
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                client.leave()
                navigate('/')
              }}
            >
              Leave
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
