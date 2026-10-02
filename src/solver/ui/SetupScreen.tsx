import { useMemo, useState } from 'react'
import { cardsOfSet, isRedSet, setGlyph, setKind, type CardId } from '../engine/cards'
import { validateSetup } from '../engine/history'
import { teamOf, type GameSetup } from '../engine/types'
import { DEFAULT_TEAM_NAMES, MODES, TEAM_NAME_MAX, type TableSize } from '../../../shared/rules'
import { CardChip } from './CardChip'
import { TEAM_STYLE } from './context'
import { BrandMark } from './Dashboard'
import { Avatar, Button, TeamDot } from './kit'

const LAST_SETUP_KEY = 'major-minor-assistant/last-setup'
const SAMPLE = ['Asha', 'Rahul', 'Amit', 'Meera', 'Priya', 'Dev', 'Sara', 'Kiran']

function loadLast(): GameSetup | null {
  try {
    const raw = localStorage.getItem(LAST_SETUP_KEY)
    return raw ? (JSON.parse(raw) as GameSetup) : null
  } catch {
    return null
  }
}

function Step({ n, title, meta, children }: { n: number; title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="surface min-w-0 rounded-xl">
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-champagne/40 font-mono text-[11px] text-champagne">{n}</span>
          <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        </div>
        {meta}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function SetupScreen({ onStart }: { onStart: (s: GameSetup) => string | null }) {
  const last = useMemo(loadLast, [])
  const [size, setSize] = useState<TableSize>(last?.size ?? 8)
  const [names, setNames] = useState<string[]>(() => {
    const prev = last?.players ?? []
    return Array.from({ length: 8 }, (_, i) => prev[i] ?? '')
  })
  const [me, setMe] = useState<number>(Math.min(last?.me ?? 0, (last?.size ?? 8) - 1))
  const [cards, setCards] = useState<CardId[]>([])
  const [firstTurn, setFirstTurn] = useState<number>(0)
  const [teamNames, setTeamNames] = useState<[string, string]>(last?.teamNames ?? [DEFAULT_TEAM_NAMES[0], DEFAULT_TEAM_NAMES[1]])
  const [tried, setTried] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const mode = MODES[size]
  const players = names.slice(0, size)
  const tn: [string, string] = [teamNames[0].trim() || DEFAULT_TEAM_NAMES[0], teamNames[1].trim() || DEFAULT_TEAM_NAMES[1]]
  const setup: GameSetup = { size, players: players.map((p) => p.trim()), me, myCards: cards, firstTurn: Math.min(firstTurn, size - 1), teamNames: tn }
  const errors = validateSetup(setup)
  if (tn[0].toLowerCase() === tn[1].toLowerCase()) errors.push('The two teams need different names.')

  const changeSize = (n: TableSize) => {
    setSize(n)
    setMe((m) => Math.min(m, n - 1))
    setFirstTurn((f) => Math.min(f, n - 1))
    // Cards that don't exist at the new size (8s & Jokers at 8 players) or exceed the hand size are dropped.
    setCards((cs) => cs.filter((c) => c < MODES[n].cards).slice(0, MODES[n].handSize))
  }
  const toggle = (c: CardId) =>
    setCards((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : cs.length >= mode.handSize ? cs : [...cs, c]))

  const start = () => {
    setTried(true)
    if (errors.length) return
    const err = onStart(setup)
    if (err) setStartError(err)
    else
      try {
        localStorage.setItem(LAST_SETUP_KEY, JSON.stringify({ ...setup, myCards: [] }))
      } catch {
        /* ignore */
      }
  }

  const label = (i: number) => players[i]?.trim() || `P${i + 1}`
  const seat = (i: number) => {
    const t = TEAM_STYLE[teamOf(i)]
    return (
      <div
        key={i}
        className={`flex h-11 items-center gap-2.5 rounded-lg border px-2 transition-all focus-within:border-champagne/45 ${
          me === i ? 'border-champagne/35 bg-champagne/[0.05]' : 'border-white/[0.07] bg-black/20'
        }`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px]" style={{ color: t.hex, boxShadow: `inset 0 0 0 1px rgb(${t.rgb} / 0.4)` }}>
          {i + 1}
        </span>
        <input
          className="min-w-0 flex-1 bg-transparent text-[14px] text-fg placeholder:text-fg-4 focus:outline-none"
          placeholder={`Player ${i + 1}`}
          value={names[i]}
          onChange={(e) => setNames((ps) => ps.map((p, j) => (j === i ? e.target.value : p)))}
        />
        <label className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] ${me === i ? 'text-champagne' : 'text-fg-4'}`}>
          <input type="radio" name="me" checked={me === i} onChange={() => setMe(i)} className="accent-[#e6d2a2]" />
          Me
        </label>
      </div>
    )
  }

  const sorted = mode.sets.flatMap((s) => cardsOfSet(s)).filter((c) => cards.includes(c))

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-[64px] max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandMark />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-4">New game</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
        <div className="mb-6 flex items-end justify-between gap-8 sm:mb-8">
          <div className="min-w-0">
            <h1 className="text-display text-[44px] leading-[0.95] text-fg sm:text-[56px]">
              Set the <em className="text-champagne">table.</em>
            </h1>
            <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-fg-2 sm:text-[15px]">
              Seat the players and pick your {mode.handSize} cards. Every ask you record becomes exact deductions about who holds what.
            </p>
          </div>
          {/* live seating preview */}
          <div className="relative hidden h-[150px] w-[260px] shrink-0 lg:block">
            <div className="absolute left-1/2 top-1/2 h-[56%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-white/[0.07]" style={{ background: 'radial-gradient(ellipse at 50% 30%, #1b2130, #0b0d12)' }} />
            {players.map((_, i) => {
              const k = (i - me + size) % size
              const a = Math.PI / 2 + (k * 2 * Math.PI) / size
              return (
                <div key={i} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5" style={{ left: `${50 + 44 * Math.cos(a)}%`, top: `${50 + 40 * Math.sin(a)}%` }}>
                  <Avatar name={me === i ? 'You' : label(i)} player={i} size={24} active={me === i} />
                  <span className="max-w-14 truncate text-[9px] text-fg-3">{label(i)}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <Step
            n={1}
            title="Players and seating"
            meta={
              <button type="button" className="text-xs text-fg-3 transition-colors hover:text-champagne" onClick={() => setNames(SAMPLE)}>
                Fill sample names
              </button>
            }
          >
            <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Table size">
              {([8, 6] as TableSize[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={size === n}
                  onClick={() => changeSize(n)}
                  className={`rounded-xl border p-2.5 text-left transition-all ${size === n ? 'border-champagne/50 bg-champagne/[0.07]' : 'border-white/[0.07] bg-black/20 hover:border-white/15'}`}
                >
                  <span className="flex items-baseline gap-1.5">
                    <span className={`text-display text-[26px] leading-none ${size === n ? 'text-champagne' : 'text-fg'}`}>{n}</span>
                    <span className="text-[13px] text-fg">players</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-fg-3">{MODES[n].detail}</span>
                </button>
              ))}
            </div>

            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([0, 1] as const).map((t) => (
                <label key={t} className="flex h-11 items-center gap-2.5 rounded-lg border border-white/[0.08] bg-black/25 px-3 focus-within:border-champagne/45" style={{ boxShadow: `inset 3px 0 0 ${TEAM_STYLE[t].hex}` }}>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Team {t + 1}</span>
                  <input
                    value={teamNames[t]}
                    maxLength={TEAM_NAME_MAX}
                    placeholder={DEFAULT_TEAM_NAMES[t]}
                    onChange={(e) => setTeamNames((x) => (t === 0 ? [e.target.value, x[1]] : [x[0], e.target.value]))}
                    aria-label={`Team ${t + 1} name`}
                    className={`text-display min-w-0 flex-1 bg-transparent text-lg leading-none placeholder:text-fg-4 focus:outline-none ${TEAM_STYLE[t].text}`}
                  />
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[0, 1].map((t) => (
                <div key={t} className="min-w-0">
                  <div className={`mb-2 flex items-center gap-2 text-xs font-medium ${TEAM_STYLE[t].text}`}>
                    <TeamDot team={t as 0 | 1} /> {tn[t]} <span className="text-fg-4">· Team {t + 1}</span>
                  </div>
                  <div className="space-y-1.5">{Array.from({ length: size / 2 }, (_, k) => seat(k * 2 + t))}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-lg border border-white/[0.05] bg-black/20 p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Seating order · teams alternate</div>
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs">
                {players.map((_, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 ${me === i ? 'bg-champagne/15 text-champagne' : 'text-fg-2'}`}>
                      <TeamDot player={i} />
                      {label(i)}
                    </span>
                    {i < size - 1 && <span className="text-fg-4">›</span>}
                  </span>
                ))}
              </div>
            </div>

            <label className="mt-5 block border-t border-white/[0.05] pt-5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">First turn</span>
              <select
                className="mt-2 h-10 w-full rounded-lg border border-white/[0.08] bg-black/30 px-2.5 text-[14px] text-fg focus:border-champagne/45 focus:outline-none [&>option]:bg-ink-800"
                value={Math.min(firstTurn, size - 1)}
                onChange={(e) => setFirstTurn(+e.target.value)}
              >
                {players.map((p, i) => (
                  <option key={i} value={i}>
                    {p.trim() || `Player ${i + 1}`}
                    {me === i ? ' (you)' : ''}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs text-fg-4">Only opponents can be asked, as in the house rules.</span>
            </label>
          </Step>

          <Step
            n={2}
            title="Your starting hand"
            meta={
              <span className="flex items-center gap-2 text-xs">
                <span className="flex gap-0.5">
                  {Array.from({ length: mode.handSize }).map((_, i) => (
                    <span key={i} className={`h-1.5 w-2.5 rounded-full transition-colors ${i < cards.length ? 'bg-champagne' : 'bg-white/10'}`} />
                  ))}
                </span>
                <span className="font-mono text-fg-3">{cards.length}/{mode.handSize}</span>
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {mode.sets.map((s) => (
                <div key={s} className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-fg-3">
                    <span className={isRedSet(s) ? 'text-rose' : 'text-fg-2'}>{setGlyph(s)}</span>
                    {setKind(s)}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cardsOfSet(s).map((c) => (
                      <CardChip
                        key={c}
                        card={c}
                        size="md"
                        variant={cards.includes(c) ? 'known' : 'possible'}
                        selected={cards.includes(c)}
                        disabled={!cards.includes(c) && cards.length >= mode.handSize}
                        onClick={() => toggle(c)}
                        inspect={false}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex min-h-[92px] items-end justify-center overflow-hidden border-t border-white/[0.05] pt-4">
              {sorted.length === 0 ? (
                <span className="self-center text-center text-xs text-fg-4">
                  Your hand appears here · {size === 8 ? 'the 8s are removed (48 cards, 8 sets of six)' : '54 cards incl. 8s & Jokers, 9 sets of six'}
                </span>
              ) : (
                sorted.map((c, i) => {
                  const n = sorted.length
                  const angle = n > 1 ? -12 + (24 / (n - 1)) * i : 0
                  return (
                    <div key={c} className="animate-rise" style={{ marginLeft: i ? (n > 6 ? -22 : -14) : 0, transform: `rotate(${angle}deg) translateY(${Math.abs(angle) * 0.3}px)`, transformOrigin: '50% 120%' }}>
                      <CardChip card={c} size="lg" variant="known" inspect={false} />
                    </div>
                  )
                })
              )}
            </div>
          </Step>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-ink-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 py-3 sm:px-6" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <span className="min-w-0 flex-1 truncate text-[13px] text-rose">{tried && errors.length > 0 ? errors[0] : startError}</span>
          <Button variant="primary" size="xl" onClick={start}>
            Start game <span aria-hidden>→</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
