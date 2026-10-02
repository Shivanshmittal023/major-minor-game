import { useMemo, useState } from 'react'
import { cardsOfSet, isMajorSet, SET_DISPLAY_ORDER, SUIT_SYMBOL, suitOfSet, type CardId } from '../engine/cards'
import { validateSetup } from '../engine/history'
import { HAND_SIZE, teamOf, type GameSetup } from '../engine/types'
import { CardChip } from './CardChip'
import { TEAM_STYLE } from './context'
import { BrandMark } from './Dashboard'
import { Avatar, Button, TeamDot } from './kit'

const LAST_SETUP_KEY = 'major-minor-assistant/last-setup'

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
    <section className="surface rounded-xl">
      <header className="flex min-h-12 items-center justify-between border-b border-white/[0.05] px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-champagne/40 font-mono text-[11px] text-champagne">{n}</span>
          <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        </div>
        {meta}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function SetupScreen({ onStart }: { onStart: (s: GameSetup) => string | null }) {
  const last = useMemo(loadLast, [])
  const [players, setPlayers] = useState<string[]>(last?.players ?? Array(8).fill(''))
  const [me, setMe] = useState<number>(last?.me ?? 0)
  const [cards, setCards] = useState<CardId[]>([])
  const [firstTurn, setFirstTurn] = useState<number>(0)
  const [tried, setTried] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const setup: GameSetup = { players: players.map((p) => p.trim()), me, myCards: cards, firstTurn }
  const errors = validateSetup(setup)

  const toggle = (c: CardId) =>
    setCards((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : cs.length >= HAND_SIZE ? cs : [...cs, c]))

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

  const label = (i: number) => players[i].trim() || `P${i + 1}`

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
          className="min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-4 focus:outline-none"
          placeholder={`Player ${i + 1}`}
          value={players[i]}
          autoFocus={i === 0}
          onChange={(e) => setPlayers((ps) => ps.map((p, j) => (j === i ? e.target.value : p)))}
        />
        <label className={`flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] ${me === i ? 'text-champagne' : 'text-fg-4 hover:text-fg-2'}`}>
          <input type="radio" name="me" checked={me === i} onChange={() => setMe(i)} className="accent-[#e6d2a2]" />
          Me
        </label>
      </div>
    )
  }

  const sorted = SET_DISPLAY_ORDER.flatMap((s) => cardsOfSet(s)).filter((c) => cards.includes(c))

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-6">
          <BrandMark />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-4">New game</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-12 pt-10">
        <div className="mb-8 flex items-end justify-between gap-8">
          <div>
            <h1 className="text-display text-[56px] leading-[0.95] text-fg">
              Set the <em className="text-champagne">table.</em>
            </h1>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-fg-2">
              Seat the eight players and pick your six cards. From there, every ask you record is turned into exact deductions about who holds what.
            </p>
          </div>
          {/* live seating preview */}
          <div className="relative hidden h-[150px] w-[260px] shrink-0 lg:block">
            <div className="absolute left-1/2 top-1/2 h-[56%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-white/[0.07]" style={{ background: 'radial-gradient(ellipse at 50% 30%, #1b2130, #0b0d12)' }} />
            {players.map((_, i) => {
              const k = (i - me + 8) % 8
              const a = Math.PI / 2 + (k * Math.PI) / 4
              return (
                <div key={i} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5" style={{ left: `${50 + 44 * Math.cos(a)}%`, top: `${50 + 40 * Math.sin(a)}%` }}>
                  <Avatar name={me === i ? 'You' : label(i)} player={i} size={24} active={me === i} />
                  <span className="max-w-14 truncate text-[9px] text-fg-3">{label(i)}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Step
            n={1}
            title="Players and seating"
            meta={
              <button type="button" className="text-xs text-fg-3 transition-colors hover:text-champagne" onClick={() => setPlayers(['Asha', 'Rahul', 'Amit', 'Meera', 'Priya', 'Dev', 'Sara', 'Kiran'])}>
                Fill sample names
              </button>
            }
          >
            <div className="grid grid-cols-2 gap-4">
              {[0, 1].map((t) => (
                <div key={t}>
                  <div className={`mb-2 flex items-center gap-2 text-xs font-medium ${TEAM_STYLE[t].text}`}>
                    <TeamDot team={t as 0 | 1} /> {TEAM_STYLE[t].name} <span className="text-fg-4">· Team {t + 1}</span>
                  </div>
                  <div className="space-y-1.5">{[0, 1, 2, 3].map((k) => seat(k * 2 + t))}</div>
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
                    {i < 7 && <span className="text-fg-4">›</span>}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.05] pt-5">
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">First turn</span>
                <select
                  className="mt-2 h-9 w-full rounded-lg border border-white/[0.08] bg-black/30 px-2.5 text-[13px] text-fg focus:border-champagne/45 focus:outline-none [&>option]:bg-ink-800"
                  value={firstTurn}
                  onChange={(e) => setFirstTurn(+e.target.value)}
                >
                  {players.map((p, i) => (
                    <option key={i} value={i}>
                      {p.trim() || `Player ${i + 1}`}
                      {me === i ? ' (you)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <p className="pt-6 text-xs text-fg-4">Only opponents can be asked, as in the house rules.</p>
            </div>
          </Step>

          <Step
            n={2}
            title="Your starting hand"
            meta={
              <span className="flex items-center gap-2 text-xs">
                <span className="flex gap-0.5">
                  {Array.from({ length: HAND_SIZE }).map((_, i) => (
                    <span key={i} className={`h-1.5 w-3 rounded-full transition-colors ${i < cards.length ? 'bg-champagne' : 'bg-white/10'}`} />
                  ))}
                </span>
                <span className="font-mono text-fg-3">{cards.length}/{HAND_SIZE}</span>
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {SET_DISPLAY_ORDER.map((s) => {
                const red = suitOfSet(s) === 'H' || suitOfSet(s) === 'D'
                return (
                  <div key={s}>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs text-fg-3">
                      <span className={red ? 'text-rose' : 'text-fg-2'}>{SUIT_SYMBOL[suitOfSet(s)]}</span>
                      {isMajorSet(s) ? 'Major' : 'Minor'}
                    </div>
                    <div className="flex gap-1">
                      {cardsOfSet(s).map((c) => (
                        <CardChip
                          key={c}
                          card={c}
                          size="md"
                          variant={cards.includes(c) ? 'known' : 'possible'}
                          selected={cards.includes(c)}
                          disabled={!cards.includes(c) && cards.length >= HAND_SIZE}
                          onClick={() => toggle(c)}
                          inspect={false}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-5 flex h-[92px] items-end justify-center border-t border-white/[0.05] pt-4">
              {sorted.length === 0 ? (
                <span className="self-center text-xs text-fg-4">Your hand appears here · the 8s are removed (48 cards, 8 sets of six)</span>
              ) : (
                sorted.map((c, i) => {
                  const n = sorted.length
                  const angle = n > 1 ? -12 + (24 / (n - 1)) * i : 0
                  return (
                    <div key={c} className="animate-rise" style={{ marginLeft: i ? -14 : 0, transform: `rotate(${angle}deg) translateY(${Math.abs(angle) * 0.3}px)`, transformOrigin: '50% 120%' }}>
                      <CardChip card={c} size="lg" variant="known" inspect={false} />
                    </div>
                  )
                })
              )}
            </div>
          </Step>
        </div>

        <div className="mt-6 flex items-center justify-end gap-4">
          {tried && errors.length > 0 && <span className="text-[13px] text-rose">{errors[0]}</span>}
          {startError && <span className="text-[13px] text-rose">{startError}</span>}
          <Button variant="primary" size="xl" onClick={start} disabled={tried && errors.length > 0}>
            Start game <span aria-hidden>→</span>
          </Button>
        </div>
      </main>
    </div>
  )
}
