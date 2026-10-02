import { useEffect, useState } from 'react'
import type { PlayerView, Snapshot } from '../../shared/protocol'
import { DEFAULT_TEAM_NAMES, MODES, RULES_SUMMARY, TEAM_NAME_MAX, teamLabel, teamOfSeat, type TeamId } from '../../shared/rules'
import { navigate } from '../App'
import { client } from '../net/client'
import { Avatar, Badge, BrandMark, Button, Check, Cross, Panel, TEAM_STYLE, TeamDot, useMediaQuery, teamName } from '../ui/kit'

export function Lobby({ snap }: { snap: Snapshot }) {
  const [picked, setPicked] = useState<string | null>(null) // player selected for seating — anyone can arrange the table
  const myId = snap.you.id
  const byId = new Map(snap.players.map((p) => [p.id, p]))
  const seated = snap.seating.filter(Boolean).length
  const offlineSeated = snap.seating.filter((id) => id && !byId.get(id)?.connected).map((id) => byId.get(id!)!.name)
  const n = snap.size
  const countdown = useCountdown(snap.autoStart)

  const clickSeat = (seat: number) => {
    const occupant = snap.seating[seat]
    if (picked) {
      if (picked !== occupant) client.seat(picked, seat)
      setPicked(null)
    } else if (occupant) setPicked(occupant)
    else client.seat(myId, seat) // tapping an empty seat sits you there
  }

  let blocker: string | null = null
  if (seated < n) blocker = `Seat all ${n} players · ${seated}/${n} seated`
  else if (offlineSeated.length) blocker = `Waiting for ${offlineSeated.join(', ')} to reconnect`

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-[64px] max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          <button type="button" onClick={() => navigate('/')} aria-label="Home">
            <BrandMark />
          </button>
          <div className="flex items-center gap-2">
            <Badge tone="accent">Lobby</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('Leave this table?')) {
                  client.leave()
                  navigate('/')
                }
              }}
            >
              Leave
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
        <Invite code={snap.code} count={snap.players.length} size={n} />

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Panel
            eyebrow="Guests"
            title="Players"
            meta={`${snap.players.length} joined · ${snap.players.filter((p) => p.connected).length} online`}
            flush
          >
            <ul className="divide-y divide-white/[0.04]">
              {snap.players.map((p) => (
                <PlayerRow key={p.id} p={p} you={p.id === snap.you.id} canKick picked={picked === p.id} onPick={() => setPicked(picked === p.id ? null : p.id)} />
              ))}
            </ul>
            <p className="border-t border-white/[0.05] px-4 py-3 text-xs text-fg-3 sm:px-5">
              {picked ? (
                <span className="text-champagne">Now tap a seat for {picked === myId ? 'yourself' : byId.get(picked)?.name}.</span>
              ) : (
                'Everyone can arrange the table: tap an empty seat to sit there, or tap a player then a seat. Tap two seated players to swap them.'
              )}
            </p>
          </Panel>

          <div className="space-y-5">
            <Panel
              eyebrow="Seating"
              title="Teams & table"
              meta="Teams alternate around the table"
              actions={
                (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Button size="sm" onClick={() => client.autoSeat()} disabled={seated === n || seated === snap.players.length}>
                      Auto-fill
                    </Button>
                    <Button size="sm" onClick={() => client.shuffleSeats()} disabled={seated < 2}>
                      Shuffle
                    </Button>
                    <Button size="sm" onClick={() => client.swapTeams()} disabled={seated === 0} title="Everyone moves one seat, so every player changes team">
                      Swap teams
                    </Button>
                    <Button size="sm" onClick={() => client.fillBots()} disabled={seated === n} title="Fill every empty seat with a practice bot — handy for testing alone">
                      Fill with bots
                    </Button>
                  </div>
                )
              }
            >
              <TeamNames names={snap.teamNames} />
              <SeatingBoard snap={snap} picked={picked} onSeat={clickSeat} onUnseat={(id) => client.seat(id, null)} />
            </Panel>
            <Rules />
          </div>
        </div>
      </main>

      {/* start bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-ink-950/90 backdrop-blur-md">
        <div className="pb-safe mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 pt-3 sm:px-6">
          <div className="min-w-0 text-[13px]">
            {countdown !== null ? (
              <span className="flex items-center gap-3 text-champagne">
                <span className="text-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-champagne/50 text-xl leading-none">{countdown}</span>
                <span>
                  <span className="block font-medium">Everyone's here — dealing in {countdown}…</span>
                  <span className="block text-[11px] text-fg-3">Anyone can start now. Unseat someone to stop the countdown.</span>
                </span>
              </span>
            ) : blocker ? (
              <span className="text-fg-3">{blocker} · the game deals itself once everyone's in</span>
            ) : (
              <span className="flex items-center gap-2 text-sage">
                <Check /> Table is ready — all {n} seated and online
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="primary" size="xl" onClick={() => client.start()} disabled={!!blocker}>
              Start now <span aria-hidden>→</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Invite({ code, count, size }: { code: string; count: number; size: 6 | 8 }) {
  const link = `${location.origin}/r/${code}`
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const copy = async (what: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? link : code)
      setCopied(what)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      client.toast('Copy failed — select the link and copy it manually.', 'error')
    }
  }
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  return (
    <section className="surface relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(600px 240px at 0% 0%, rgb(230 210 162 / 0.08), transparent 70%)' }} />
      <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-4">Invite {size === 8 ? 'seven' : 'five'} friends</span>
            <Badge tone="accent">{MODES[size].title}</Badge>
            <span className="text-[11px] text-fg-4">{MODES[size].detail}</span>
          </div>
          <h1 className="text-display mt-1 text-[40px] leading-[0.95] text-fg sm:text-[52px]">
            The table is <em className="text-champagne">open.</em>
          </h1>
          <p className="mt-3 max-w-md text-[14px] text-fg-2">Everyone opens the link on their own device and enters their name. {count < size ? `${size - count} more to go.` : 'Everyone is here.'}</p>
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-4">Game code</span>
            <button type="button" onClick={() => copy('code')} className="group flex items-center gap-2" title="Copy code">
              <span className="text-display text-[40px] leading-none tracking-[0.12em] text-champagne sm:text-[48px]">{code}</span>
              <span className="text-[11px] text-fg-4 group-hover:text-fg-2">{copied === 'code' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <div className="flex w-full max-w-[520px] items-center gap-2 rounded-lg border border-white/[0.08] bg-black/30 p-1 pl-3">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2">{link}</span>
            <Button size="sm" variant={copied === 'link' ? 'hit' : 'primary'} onClick={() => copy('link')}>
              {copied === 'link' ? <><Check /> Copied</> : 'Copy link'}
            </Button>
            {canShare && (
              <Button size="sm" onClick={() => navigator.share({ title: 'Major–Minor', text: `Join my Major–Minor table · code ${code}`, url: link }).catch(() => {})}>
                Share
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function PlayerRow({ p, you, canKick, picked, onPick }: { p: PlayerView; you: boolean; canKick: boolean; picked: boolean; onPick: () => void }) {
  const team = p.seat === null ? null : teamOfSeat(p.seat)
  return (
    <li
      className={`group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.025] sm:px-5 ${picked ? 'bg-champagne/[0.06]' : ''}`}
      onClick={onPick}
    >
      <Avatar name={p.name} team={team} size={30} dim={!p.connected} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-[13px] font-medium ${picked ? 'text-champagne' : 'text-fg'}`}>{p.name}</span>
          {you && <span className="text-[11px] text-fg-4">you</span>}
          {p.bot && <Badge>Bot</Badge>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-3">
          <span className={`h-1.5 w-1.5 rounded-full ${p.connected ? 'bg-sage' : 'bg-fg-4'}`} />
          {p.connected ? 'Online' : 'Offline'}
          <span className="text-fg-4">·</span>
          {p.seat === null ? <span className="text-fg-4">Not seated</span> : <span className={TEAM_STYLE[teamOfSeat(p.seat)].text}>Seat {p.seat + 1} · {teamName(teamOfSeat(p.seat))}</span>}
        </div>
      </div>
      {canKick && !you && (
        <button
          type="button"
          title={`Remove ${p.name}`}
          onClick={(e) => {
            e.stopPropagation()
            if (confirm(`Remove ${p.name} from the lobby?`)) client.kick(p.id)
          }}
          className="rounded-md p-1.5 text-fg-4 opacity-0 transition hover:bg-rose/10 hover:text-rose group-hover:opacity-100"
        >
          <Cross />
        </button>
      )}
    </li>
  )
}

function SeatingBoard({ snap, picked, onSeat, onUnseat }: { snap: Snapshot; picked: string | null; onSeat: (s: number) => void; onUnseat: (id: string) => void }) {
  const wide = useMediaQuery('(min-width: 900px)')
  const byId = new Map(snap.players.map((p) => [p.id, p]))
  const slot = (seat: number, compact: boolean) => {
    const id = snap.seating[seat]
    const p = id ? byId.get(id) : undefined
    const team = teamOfSeat(seat)
    const st = TEAM_STYLE[team]
    const isPicked = !!id && id === picked
    const target = !!picked && !isPicked
    return (
      <button
        key={seat}
        type="button"
        onClick={() => onSeat(seat)}
        className={`surface-raised group relative flex items-center gap-2.5 rounded-xl p-2.5 text-left transition-all duration-150 ${compact ? 'w-full' : 'w-[176px]'} hover:-translate-y-0.5 hover:border-white/15 ${
          !p && !picked ? 'hover:border-dashed hover:border-champagne/35' : ''
        } ${isPicked ? 'border-champagne/50' : ''} ${target ? 'border-dashed border-champagne/35' : ''}`}
      >
        <span className="absolute inset-x-3 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${st.hex}, transparent)`, opacity: 0.7 }} />
        {p ? (
          <Avatar name={p.name} team={team} size={32} dim={!p.connected} active={isPicked} />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-white/15 font-mono text-[11px] text-fg-4">{seat + 1}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] font-medium ${p ? 'text-fg' : 'text-fg-4'}`}>
            {p ? (p.id === snap.you.id ? `${p.name} (you)` : p.name) : <span className="group-hover:text-champagne/80">{picked ? 'Place here' : 'Sit here'}</span>}
          </span>
          <span className={`block text-[10px] ${st.text} opacity-80`}>
            Seat {seat + 1} · {teamName(team)}
          </span>
        </span>
        {p && (
          <span
            role="button"
            tabIndex={-1}
            title="Unseat"
            onClick={(e) => {
              e.stopPropagation()
              onUnseat(p.id)
            }}
            className="rounded p-1 text-fg-4 opacity-0 transition hover:text-rose group-hover:opacity-100"
          >
            <Cross className="h-3 w-3" />
          </span>
        )}
      </button>
    )
  }

  if (!wide)
    return (
      <div className="grid grid-cols-2 gap-3">
        {([0, 1] as TeamId[]).map((t) => (
          <div key={t} className="space-y-2">
            <div className={`flex items-center gap-1.5 text-xs font-medium ${TEAM_STYLE[t].text}`}>
              <TeamDot team={t} /> {teamName(t)} <span className="text-fg-4">· {teamLabel(t)}</span>
            </div>
            {Array.from({ length: snap.size / 2 }, (_, k) => slot(k * 2 + t, true))}
          </div>
        ))}
      </div>
    )

  return (
    <div className="relative h-[430px]">
      <div
        className="absolute left-1/2 top-1/2 h-[46%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, #1b2130 0%, #11141c 55%, #0b0d12 100%)',
          boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.07), inset 0 -30px 60px rgb(0 0 0 / 0.45), 0 30px 80px -30px rgb(0 0 0 / 0.9)',
        }}
      >
        <div className="absolute inset-[14px] rounded-[50%] border border-white/[0.045]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-4">Preview</div>
          <div className="text-display text-3xl text-fg">{snap.seating.filter(Boolean).length}/{snap.size}</div>
          <div className="mt-1 flex items-center gap-3 text-[11px]">
            {([0, 1] as TeamId[]).map((t) => (
              <span key={t} className={`flex items-center gap-1.5 ${TEAM_STYLE[t].text}`}>
                <TeamDot team={t} /> {teamName(t)} {snap.seating.filter((id, i) => id && teamOfSeat(i) === t).length}/{snap.size / 2}
              </span>
            ))}
          </div>
        </div>
      </div>
      {Array.from({ length: snap.size }).map((_, seat) => {
        const a = -Math.PI / 2 + (seat * 2 * Math.PI) / snap.size
        return (
          <div key={seat} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${50 + 38 * Math.cos(a)}%`, top: `${50 + 39 * Math.sin(a)}%` }}>
            {slot(seat, false)}
          </div>
        )
      })}
    </div>
  )
}

function Rules() {
  return (
    <Panel eyebrow="House rules" title="How this table plays" meta="The same for every game">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {RULES_SUMMARY.map((r) => (
          <div key={r.label} className="flex gap-3">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-champagne/70" />
            <div>
              <dt className="text-[13px] font-medium text-fg">{r.label}</dt>
              <dd className="text-xs text-fg-3">{r.detail}</dd>
            </div>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

/** Anyone in the lobby can name the teams. Saved on blur or Enter; empty restores the default. */
function TeamNames({ names }: { names: [string, string] }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {([0, 1] as TeamId[]).map((t) => (
        <TeamNameInput key={`${t}:${names[t]}`} team={t} value={names[t]} />
      ))}
    </div>
  )
}

function TeamNameInput({ team, value }: { team: TeamId; value: string }) {
  const [draft, setDraft] = useState(value)
  const st = TEAM_STYLE[team]
  const save = () => {
    const next = draft.trim()
    if (next !== value) client.teamName(team, next)
  }
  return (
    <label className="flex h-11 items-center gap-2.5 rounded-lg border border-white/[0.08] bg-black/25 px-3 transition-colors focus-within:border-champagne/45" style={{ boxShadow: `inset 3px 0 0 ${st.hex}` }}>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">{teamLabel(team)}</span>
      <input
        value={draft}
        maxLength={TEAM_NAME_MAX}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(value)
        }}
        placeholder={DEFAULT_TEAM_NAMES[team]}
        aria-label={`${teamLabel(team)} name`}
        className={`text-display min-w-0 flex-1 bg-transparent text-lg leading-none placeholder:text-fg-4 focus:outline-none ${st.text}`}
      />
      <span className="text-[10px] text-fg-4">rename</span>
    </label>
  )
}

/** Seconds left on the auto-start countdown (server time, corrected for this device's clock), or null. */
function useCountdown(a: { at: number | null; now: number } | null): number | null {
  const [, tick] = useState(0)
  const at = a?.at ?? null
  const skew = a ? a.now - Date.now() : 0
  useEffect(() => {
    if (at === null) return
    const id = setInterval(() => tick((x) => x + 1), 250)
    return () => clearInterval(id)
  }, [at])
  if (at === null) return null
  return Math.max(0, Math.ceil((at - (Date.now() + skew)) / 1000))
}
