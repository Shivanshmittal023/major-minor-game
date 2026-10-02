import { useEffect, useRef, useState } from 'react'
import { cardsOfSet, EXTRA_SET, isRedSet, setGlyph, setKind, setLabel, type SetId } from '../../shared/cards'
import { teamLabel, type TeamId } from '../../shared/rules'
import { navigate } from '../App'
import { client } from '../net/client'
import { Badge, Button, Panel, TEAM_STYLE, TeamDot, teamName } from '../ui/kit'
import type { View } from './view'

/** Public set status: who completed what, plus which cards of each set you hold. */
export function SetsBoard({ v, compact = false }: { v: View; compact?: boolean }) {
  const done = v.g.completed.filter((t) => t !== null).length
  const held = new Set(v.hand)
  if (compact)
    return (
      <section className="surface rounded-xl p-3">
        <div className="mb-2 flex items-baseline justify-between px-0.5">
          <span className="text-[12px] font-semibold text-fg">Sets</span>
          <span className="text-[11px] text-fg-4">{done} of {v.sets.length} won</span>
        </div>
        <div className={`grid gap-1.5 ${v.sets.length === 9 ? 'grid-cols-3' : 'grid-cols-4'}`}>
          {v.sets.map((s) => (
            <MiniSet key={s} s={s} team={v.g.completed[s]} mine={cardsOfSet(s).filter((c) => held.has(c)).length} />
          ))}
        </div>
      </section>
    )
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

function MiniSet({ s, team, mine }: { s: SetId; team: TeamId | null; mine: number }) {
  const style = team !== null ? { borderColor: `rgb(${TEAM_STYLE[team].rgb} / 0.4)`, background: `rgb(${TEAM_STYLE[team].rgb} / 0.1)` } : undefined
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5" style={style} title={setLabel(s)}>
      <div className="flex items-center gap-1 text-[11px] leading-none">
        <span className={`text-[13px] ${isRedSet(s) ? 'text-rose' : s === EXTRA_SET ? 'text-champagne' : 'text-fg'}`}>{setGlyph(s)}</span>
        <span className="truncate text-fg-2">{s === EXTRA_SET ? '8s·JK' : setKind(s).slice(0, 3)}</span>
      </div>
      <div className={`mt-1 truncate text-[10px] leading-none ${team !== null ? TEAM_STYLE[team].text : mine ? 'text-champagne/80' : 'text-fg-4'}`}>
        {team !== null ? teamName(team) : mine ? `you ${mine}` : '—'}
      </div>
    </div>
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
        {team !== null ? <Badge tone={team === 0 ? 'team0' : 'team1'}>{teamName(team)}</Badge> : <span className="font-mono text-[10px] text-fg-4">in play</span>}
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
            {w === 'draw' ? 'A draw.' : <><span className={TEAM_STYLE[w!].text}>{teamName(w!)}</span> win.</>}
          </h2>
          {myTeam !== null && w !== 'draw' && <p className="mt-2 text-sm text-fg-2">{w === myTeam ? 'Your team took the table.' : 'Well played — next time.'}</p>}
          <div className="mt-6 flex items-center justify-center gap-6">
            {([0, 1] as TeamId[]).map((t) => (
              <div key={t} className="text-center">
                <div className="text-display text-[56px] leading-none text-fg">{v.g.score[t]}</div>
                <div className={`mt-1 flex items-center justify-center gap-1.5 text-xs ${TEAM_STYLE[t].text}`}>
                  <TeamDot team={t} /> {teamName(t)}
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
            <Button variant="primary" size="lg" onClick={() => client.backToLobby()}>
              Back to lobby for a rematch
            </Button>
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
