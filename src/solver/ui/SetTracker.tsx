import { useEffect, useRef, useState } from 'react'
import { isMajorSet, SET_DISPLAY_ORDER, SUIT_SYMBOL, suitOfSet, type SetId } from '../engine/cards'
import { teamLabel, teamOf, type TeamId } from '../engine/types'
import { CardChip } from './CardChip'
import { TEAM_STYLE, useCtx } from './context'
import { pct } from './format'
import { Badge, Button, Panel } from './kit'

export function SetTracker() {
  const { state } = useCtx()
  const myTeam = teamOf(state.setup.me)
  const done = state.knowledge.sets.filter((s) => s.completedBy !== null).length
  return (
    <Panel
      eyebrow="Sets"
      title="Set progress"
      meta={`${done} of 8 complete`}
      actions={
        <div className="flex items-center gap-3 text-[11px] text-fg-3">
          <Legend team={myTeam} label="your team" />
          <Legend team={(1 - myTeam) as TeamId} label="opponents" />
          <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full" style={{ background: 'linear-gradient(90deg,#86aaf0 50%,#e79a5c 50%)' }} /> uncertain</span>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {SET_DISPLAY_ORDER.map((s) => (
          <SetTile key={s} s={s} />
        ))}
      </div>
    </Panel>
  )
}

function Legend({ team, label }: { team: TeamId; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-[3px] w-4 rounded-full" style={{ background: TEAM_STYLE[team].hex }} /> {label}
    </span>
  )
}

function SetTile({ s }: { s: SetId }) {
  const { state, name, layDown } = useCtx()
  const { knowledge: kn, setup } = state
  const sk = kn.sets[s]
  const myTeam = teamOf(setup.me)
  const opp = (1 - myTeam) as TeamId
  const red = suitOfSet(s) === 'H' || suitOfSet(s) === 'D'
  const mine = sk.certainByTeam[myTeam]
  const theirs = sk.certainByTeam[opp]
  const done = sk.completedBy !== null

  // Foil sweep once, when a set becomes complete while on screen.
  const prev = useRef(sk.completedBy)
  const [celebrate, setCelebrate] = useState(false)
  useEffect(() => {
    if (prev.current === null && sk.completedBy !== null) {
      setCelebrate(true)
      const t = setTimeout(() => setCelebrate(false), 1600)
      prev.current = sk.completedBy
      return () => clearTimeout(t)
    }
    prev.current = sk.completedBy
  }, [sk.completedBy])

  let status: React.ReactNode = null
  if (done) status = <Badge tone={sk.completedBy === 0 ? 'team0' : 'team1'}>{TEAM_STYLE[sk.completedBy!].name}{sk.laidDownBy === null ? ' · held' : ''}</Badge>
  else if (mine >= 4) status = <Badge tone="accent">{6 - mine} to go</Badge>
  else if (theirs >= 4) status = <Badge tone="bad">Threat</Badge>

  const doneStyle = done
    ? { borderColor: `rgb(${TEAM_STYLE[sk.completedBy!].rgb} / 0.35)`, background: `linear-gradient(180deg, rgb(${TEAM_STYLE[sk.completedBy!].rgb} / 0.07), transparent 70%)` }
    : undefined

  return (
    <div className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-black/20 p-3 transition-colors hover:border-white/[0.1] ${celebrate ? 'foil' : ''}`} style={doneStyle}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className={`text-display text-[26px] leading-none ${red ? 'text-rose' : 'text-fg'}`}>{SUIT_SYMBOL[suitOfSet(s)]}</span>
          <span className="text-[13px] font-medium text-fg">{isMajorSet(s) ? 'Major' : 'Minor'}</span>
        </div>
        {status}
      </div>

      <div className="grid grid-cols-6 gap-1">
        {sk.cards.map((c) => {
          const ck = kn.cards[c]
          let bar: React.ReactNode
          if (ck.status === 'out') bar = <span className="block h-[3px] rounded-full opacity-40" style={{ background: TEAM_STYLE[ck.laidDownBy!].hex }} />
          else if (ck.team !== null) bar = <span className="block h-[3px] rounded-full" style={{ background: TEAM_STYLE[ck.team].hex }} />
          else
            bar = (
              <span className="flex h-[3px] overflow-hidden rounded-full bg-white/[0.06]" title={`${teamLabel(0)} ${pct(ck.teamProb[0])} · ${teamLabel(1)} ${pct(ck.teamProb[1])}`}>
                <span style={{ width: `${ck.teamProb[0] * 100}%`, background: TEAM_STYLE[0].hex, opacity: 0.75 }} />
                <span style={{ width: `${ck.teamProb[1] * 100}%`, background: TEAM_STYLE[1].hex, opacity: 0.75 }} />
              </span>
            )
          const who = ck.status === 'out' ? '—' : ck.status === 'known' ? name(ck.owner!) : `${ck.possible.length}?`
          return (
            <div key={c} className="flex min-w-0 flex-col items-stretch gap-1">
              <CardChip card={c} size="xs" className="!min-w-0 w-full" variant={ck.status === 'known' ? 'known' : ck.status === 'out' ? 'out' : 'possible'} />
              {bar}
              <span className={`truncate text-center text-[10px] leading-none ${ck.status === 'known' ? TEAM_STYLE[teamOf(ck.owner!)].text : 'text-fg-4'}`} title={who}>
                {who}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2 text-[11px] text-fg-3">
        {done ? (
          sk.laidDownBy !== null ? (
            <span>Off the table · {teamLabel(sk.completedBy!)}</span>
          ) : (
            <>
              <span>All six with {teamLabel(sk.completedBy!)}</span>
              <Button size="sm" variant="secondary" className="h-6 border-champagne/35 px-2 text-[11px] text-champagne" onClick={() => layDown(s)}>
                Lay down
              </Button>
            </>
          )
        ) : (
          <>
            <span className="font-mono">
              <span className={TEAM_STYLE[myTeam].text}>{mine}</span>
              <span className="text-fg-4"> · </span>
              <span className={TEAM_STYLE[opp].text}>{theirs}</span>
              <span className="text-fg-4"> · {6 - mine - theirs}?</span>
            </span>
            <span title="Chance your team already holds all six">all yours {pct(sk.pComplete[myTeam])}</span>
          </>
        )}
      </div>
    </div>
  )
}
