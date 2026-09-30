import { cardShort, isRedSet, setGlyph, setKind, setKindShort, setLabel } from '../../shared/cards'
import { teamOfSeat, type TeamId } from '../../shared/rules'
import { Card, CardBack } from '../ui/Card'
import { Avatar, Check, Cross, TEAM_STYLE, TeamDot, useNewKeys } from '../ui/kit'
import { seatPos, type Effects, type View } from './view'

interface Props {
  v: View
  fx: Effects
  compact: boolean
  /** When choosing whom to ask, seats become tappable. */
  picking: boolean
  target: number | null
  onTarget: (seat: number) => void
}

export function Table({ v, fx, compact, picking, target, onTarget }: Props) {
  const { g, viewer } = v
  const turnNo = g.log.filter((e) => e.kind === 'ask').length + 1
  const myTeam = teamOfSeat(viewer)
  const rx = compact ? 40 : 39
  const ry = compact ? 38 : 37

  return (
    <div className={`relative w-full overflow-hidden ${compact ? 'h-[380px]' : 'h-[540px]'}`}>
      {/* the table */}
      <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${compact ? 'h-[40%] w-[62%]' : 'h-[44%] w-[52%]'}`}>
        <div
          className="absolute inset-0 rounded-[50%]"
          style={{
            background: 'radial-gradient(ellipse at 50% 30%, #1b2130 0%, #11141c 55%, #0b0d12 100%)',
            boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.07), inset 0 2px 0 rgb(255 255 255 / 0.04), inset 0 -30px 60px rgb(0 0 0 / 0.45), 0 30px 80px -30px rgb(0 0 0 / 0.9)',
          }}
        />
        <div className="absolute inset-[12px] rounded-[50%] border border-white/[0.045]" />
        {!compact && <div className="absolute inset-[28px] rounded-[50%] border border-dashed border-white/[0.035]" />}
        {Array.from({ length: v.n }).map((_, s) => {
          const { a } = seatPos(s, viewer, v.n)
          return (
            <span
              key={s}
              className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity"
              style={{ left: `${50 + 50 * Math.cos(a)}%`, top: `${50 + 50 * Math.sin(a)}%`, background: TEAM_STYLE[teamOfSeat(s)].hex, opacity: g.turn === s ? 1 : 0.5 }}
            />
          )
        })}

        {!compact && ([myTeam, (1 - myTeam) as TeamId] as TeamId[]).map((t) => <Pile key={t} v={v} team={t} side={t === myTeam ? 'left' : 'right'} />)}

        <div className={`absolute inset-0 flex flex-col items-center justify-center text-center ${compact ? 'px-4' : 'px-[23%]'}`}>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-fg-4">Turn</div>
          <div className={`text-display leading-[0.95] text-fg ${compact ? 'text-[34px]' : 'text-[52px]'}`}>{turnNo}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-2 sm:text-sm">
            <TeamDot team={teamOfSeat(g.turn)} />
            {v.myTurn ? <span className="font-medium text-champagne">Your move</span> : <span className="truncate">{v.nameOf(g.turn)} to play</span>}
          </div>
          {fx.banner && !compact && <Banner v={v} fx={fx} />}
        </div>
      </div>

      {Array.from({ length: v.n }).map((_, s) => {
        const { x, y } = seatPos(s, viewer, v.n, rx, ry)
        return (
          <div key={s} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <Seat v={v} seat={s} compact={compact} miss={fx.missSeat?.seat === s ? fx.missSeat.key : null} picking={picking} targeted={target === s} onTarget={onTarget} />
          </div>
        )
      })}

      {fx.flights.map((f) => (
        <div
          key={f.id}
          className="animate-fly pointer-events-none absolute z-20"
          style={{ animationDelay: `${f.delay}ms`, ['--x0' as string]: `${f.from.x}%`, ['--y0' as string]: `${f.from.y}%`, ['--x1' as string]: `${f.to.x}%`, ['--y1' as string]: `${f.to.y}%` }}
        >
          <Card card={f.card} size={compact ? 'lg' : 'xl'} className="shadow-[0_20px_40px_-10px_rgba(0,0,0,0.9)]" />
        </div>
      ))}
    </div>
  )
}

/** The latest request, then — after a beat — its answer. */
export function Banner({ v, fx, inline = false }: { v: View; fx: Effects; inline?: boolean }) {
  const b = fx.banner!
  const dots = (
    <span className="inline-flex gap-1 text-fg-4">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1 w-1 animate-pulse rounded-full bg-fg-3" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  )
  if (b.kind === 'declare') {
    const red = isRedSet(b.set)
    return (
      <div key={b.id} className={`animate-banner flex flex-col items-center ${inline ? '' : 'mt-3'}`}>
        <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[13px] text-fg-2">
          <span className="font-medium text-fg">{v.nameOf(b.declarer)}</span>
          <span>{b.declarer === v.me ? 'declare' : 'declares'}</span>
          <span className="inline-flex items-center gap-1 rounded-md border border-champagne/30 bg-champagne/10 px-1.5 py-0.5 text-champagne">
            <span className={red ? 'text-rose' : ''}>{setGlyph(b.set)}</span> {setKind(b.set)}
          </span>
        </div>
        <div className="mt-1 h-5 text-xs">
          {fx.revealed ? (
            <span key="r" className={`animate-rise inline-flex items-center gap-1 ${b.correct ? 'text-sage' : 'text-rose'}`}>
              {b.correct ? <Check className="h-3 w-3" /> : <Cross className="h-3 w-3" />}
              {b.correct ? `Correct — ${TEAM_STYLE[b.team].name} win the set` : `Wrong — ${TEAM_STYLE[b.team].name} take the set`}
            </span>
          ) : (
            dots
          )}
        </div>
      </div>
    )
  }
  return (
    <div key={b.id} className={`animate-banner flex flex-col items-center ${inline ? '' : 'mt-3'}`}>
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[13px] text-fg-2">
        <span className="font-medium text-fg">{v.nameOf(b.asker)}</span>
        <span>{b.asker === v.me ? 'ask' : 'asks'}</span>
        <span className="font-medium text-fg">{b.target === v.me ? 'you' : v.nameOf(b.target)}</span>
        <span>for</span>
        <Card card={b.card} size="xs" />
      </div>
      <div className="mt-1 h-5 text-xs">
        {fx.revealed ? (
          <span key="r" className={`animate-rise inline-flex items-center gap-1 ${b.success ? 'text-sage' : 'text-rose'}`}>
            {b.success ? <Check className="h-3 w-3" /> : <Cross className="h-3 w-3" />}
            {b.success ? `${b.target === v.me ? 'You' : v.nameOf(b.target)} handed over ${cardShort(b.card)}` : `${b.target === v.me ? "You don't" : `${v.nameOf(b.target)} doesn't`} have it`}
          </span>
        ) : (
          dots
        )}
      </div>
    </div>
  )
}

function Seat({ v, seat, compact, miss, picking, targeted, onTarget }: { v: View; seat: number; compact: boolean; miss: number | null; picking: boolean; targeted: boolean; onTarget: (s: number) => void }) {
  const sv = v.g.seats[seat]
  const team = teamOfSeat(seat)
  const st = TEAM_STYLE[team]
  const isTurn = v.g.turn === seat && v.snap.phase === 'playing'
  const isMe = seat === v.me
  const selectable = picking && v.canTarget(seat)
  const empty = sv.cardCount === 0

  const ring = targeted ? 'border-champagne/70 ring-2 ring-champagne/30' : selectable ? 'border-dashed border-champagne/40' : isTurn ? 'border-champagne/35' : ''

  if (compact)
    return (
      <button
        type="button"
        disabled={!selectable}
        onClick={() => onTarget(seat)}
        className={`relative flex w-[76px] flex-col items-center gap-1 rounded-xl border border-transparent p-1.5 transition-all ${ring} ${selectable ? 'bg-white/[0.03]' : ''} ${empty ? 'opacity-45' : ''}`}
      >
        {miss !== null && <span key={miss} className="animate-ripple pointer-events-none absolute inset-0 rounded-xl" />}
        <span className="relative">
          <Avatar name={v.nameOf(seat)} team={team} size={38} active={isTurn} dim={!sv.connected} />
          <span className="absolute -bottom-1 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-white/10 bg-ink-800 px-1 font-mono text-[10px] text-fg">{sv.cardCount}</span>
        </span>
        <span className={`max-w-full truncate text-[11px] ${isMe ? 'text-champagne' : 'text-fg-2'}`}>{v.nameOf(seat)}</span>
        {!sv.connected && <span className="text-[9px] text-rose/80">offline</span>}
      </button>
    )

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={() => onTarget(seat)}
      className={`surface-raised group relative w-[210px] rounded-xl p-3 text-left transition-all duration-200 ${ring} ${selectable ? 'cursor-pointer hover:-translate-y-0.5 hover:border-champagne/60' : 'cursor-default'} ${empty ? 'opacity-50' : ''}`}
    >
      <span className="absolute inset-x-3 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${st.hex}, transparent)`, opacity: 0.7 }} />
      {miss !== null && <span key={miss} className="animate-ripple pointer-events-none absolute inset-0 rounded-xl" />}
      <div className="flex items-center gap-2.5">
        <Avatar name={v.nameOf(seat)} team={team} size={32} active={isTurn} dim={!sv.connected} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className={`truncate text-[13px] font-semibold ${isMe ? 'text-champagne' : 'text-fg'}`}>{v.nameOf(seat)}</span>
            <span className="font-mono text-[10px] text-fg-4">#{seat + 1}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className={`${st.text} opacity-80`}>{st.name}</span>
            {!sv.connected && <span className="text-rose/80">· reconnecting</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-display text-2xl leading-none text-fg">{sv.cardCount}</div>
          <div className="text-[10px] text-fg-4">cards</div>
        </div>
      </div>
      <div className="mt-2.5 flex h-7 items-end">
        {empty ? (
          <span className="text-[11px] text-fg-4">No cards left</span>
        ) : (
          Array.from({ length: sv.cardCount }).map((_, i) => (
            <CardBack key={i} team={team} className="h-7 w-5 shrink-0" style={{ marginLeft: i ? (sv.cardCount > 9 ? -12 : -8) : 0, transform: `rotate(${(i - (sv.cardCount - 1) / 2) * 3}deg)` }} />
          ))
        )}
      </div>
      {selectable && (
        <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-full border border-champagne/40 bg-ink-900 px-2 py-0.5 text-[10px] font-medium text-champagne">
          {targeted ? 'Selected' : 'Ask'}
        </div>
      )}
    </button>
  )
}

/** A team's completed sets, stacked face-down inside the table — out of play. */
function Pile({ v, team, side }: { v: View; team: TeamId; side: 'left' | 'right' }) {
  const sets = v.sets.filter((s) => v.g.completed[s] === team)
  const fresh = useNewKeys(sets)
  const st = TEAM_STYLE[team]
  return (
    <div className={`absolute top-1/2 flex w-[150px] -translate-y-1/2 flex-col gap-1.5 ${side === 'left' ? 'left-[7%] items-start' : 'right-[7%] items-end'}`}>
      <div className={`flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] ${st.text} opacity-80`}>
        <TeamDot team={team} size={5} /> {st.name} · {sets.length} won
      </div>
      <div className={`flex min-h-[38px] flex-wrap gap-1.5 ${side === 'right' ? 'justify-end' : ''}`}>
        {sets.length === 0 && <span className="h-[38px] w-[30px] rounded-[4px] border border-dashed border-white/[0.08]" />}
        {sets.map((s) => {
          const red = isRedSet(s)
          return (
            <span key={s} className={`relative h-[38px] w-[30px] ${fresh.has(s) ? 'animate-reveal' : ''}`} style={fresh.has(s) ? { animationDelay: '1700ms' } : undefined} title={`${setLabel(s)} · ${st.name}`}>
              <CardBack team={team} className="absolute inset-0 h-full w-full -translate-x-[3px] translate-y-px rotate-[-11deg]" />
              <CardBack team={team} className="absolute inset-0 h-full w-full translate-x-[3px] rotate-[8deg]" />
              <span className={`paper absolute inset-0 flex flex-col items-center justify-center rounded-[4px] leading-none ${red ? 'text-crimson' : 'text-inkcard'}`}>
                <span className="text-sm">{setGlyph(s)}</span>
                <span className="mt-0.5 text-[7px] font-semibold uppercase tracking-wide opacity-70">{setKindShort(s)}</span>
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
