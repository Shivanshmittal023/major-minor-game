import { useMemo, useState } from 'react'
import { cardsOfSet, isRedSet, setGlyph, setKind, type CardId } from '../engine/cards'
import { validateSetup } from '../engine/history'
import { teamOf, type GameSetup } from '../engine/types'
import { MODES, type TableSize } from '../../../shared/rules'
import { CardChip } from './CardChip'
import { TEAM_STYLE } from './context'
import { BrandMark } from './Dashboard'
import { Button } from './kit'

const LAST_SETUP_KEY = 'major-minor-assistant/last-setup'
const defaultName = (i: number) => `Player ${i + 1}`

function loadLast(): GameSetup | null {
  try {
    const raw = localStorage.getItem(LAST_SETUP_KEY)
    return raw ? (JSON.parse(raw) as GameSetup) : null
  } catch {
    return null
  }
}

export function SetupScreen({ onStart }: { onStart: (s: GameSetup) => string | null }) {
  const last = useMemo(loadLast, [])
  const [size, setSize] = useState<TableSize>(last?.size ?? 8)
  // Everyone starts with a name, so only the people you care about need typing.
  const [names, setNames] = useState<string[]>(() => Array.from({ length: 8 }, (_, i) => last?.players[i]?.trim() || defaultName(i)))
  const [me, setMe] = useState<number>(Math.min(last?.me ?? 0, (last?.size ?? 8) - 1))
  const [cards, setCards] = useState<CardId[]>([])
  const [firstTurn, setFirstTurn] = useState<number>(0)
  const [tried, setTried] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const mode = MODES[size]
  const players = names.slice(0, size)
  const setup: GameSetup = { size, players: players.map((p, i) => p.trim() || defaultName(i)), me, myCards: cards, firstTurn: Math.min(firstTurn, size - 1) }
  const errors = validateSetup(setup)

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

  const label = 'block font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4'

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-[60px] max-w-5xl items-center justify-between px-4 sm:px-6">
          <BrandMark />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-4">New game</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-display text-[40px] leading-none text-fg sm:text-[48px]">
            Set the <em className="text-champagne">table.</em>
          </h1>
          <div className="inline-flex rounded-xl border border-white/[0.07] bg-black/25 p-1" role="radiogroup" aria-label="Table size">
            {([8, 6] as TableSize[]).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={size === n}
                onClick={() => changeSize(n)}
                className={`h-9 rounded-lg px-4 text-[13px] font-medium transition-colors ${size === n ? 'bg-white/[0.09] text-fg' : 'text-fg-3 hover:text-fg-2'}`}
              >
                {n} players
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="surface min-w-0 rounded-xl p-4 sm:p-5">
            <span className={`${label} mb-2`}>Seats in playing order</span>
            <div className="space-y-1.5">
              {players.map((_, i) => {
                const t = TEAM_STYLE[teamOf(i)]
                const isMe = me === i
                return (
                  <div key={i} className={`flex h-10 items-center gap-2 rounded-lg border pl-2.5 pr-1 transition-colors focus-within:border-champagne/45 ${isMe ? 'border-champagne/35 bg-champagne/[0.05]' : 'border-white/[0.06] bg-black/20'}`}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.hex }} title={t.name} />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-[14px] text-fg placeholder:text-fg-4 focus:outline-none"
                      value={names[i]}
                      placeholder={defaultName(i)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setNames((ps) => ps.map((p, j) => (j === i ? e.target.value : p)))}
                      aria-label={`Seat ${i + 1} name`}
                    />
                    <button
                      type="button"
                      onClick={() => setMe(i)}
                      className={`h-7 shrink-0 rounded-md px-2.5 text-[11px] font-medium transition-colors ${isMe ? 'bg-champagne text-ink-900' : 'text-fg-4 hover:text-fg-2'}`}
                    >
                      You
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex items-center gap-3 text-[11px] text-fg-4">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-tide" /> Tide</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ember" /> Ember</span>
              <span>· teams alternate round the table</span>
            </div>
            <label className="mt-4 flex items-center gap-3 border-t border-white/[0.05] pt-4">
              <span className={label}>First turn</span>
              <select
                className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/30 px-2.5 text-[14px] text-fg focus:border-champagne/45 focus:outline-none [&>option]:bg-ink-800"
                value={Math.min(firstTurn, size - 1)}
                onChange={(e) => setFirstTurn(+e.target.value)}
              >
                {players.map((p, i) => (
                  <option key={i} value={i}>
                    {me === i ? 'You' : p.trim() || defaultName(i)}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="surface min-w-0 rounded-xl p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className={label}>Your {mode.handSize} cards</span>
              <span className={`font-mono text-xs ${cards.length === mode.handSize ? 'text-champagne' : 'text-fg-3'}`}>
                {cards.length}/{mode.handSize}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
              {mode.sets.map((s) => (
                <div key={s} className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] text-fg-3">
                    <span className={isRedSet(s) ? 'text-rose' : 'text-fg-2'}>{setGlyph(s)}</span>
                    {setKind(s)}
                  </div>
                  <div className="flex flex-wrap gap-1">
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
          </section>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-ink-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3 px-4 py-3 sm:px-6" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <span className="min-w-0 flex-1 truncate text-[13px] text-rose">{tried && errors.length > 0 ? errors[0] : startError}</span>
          <Button variant="primary" size="xl" onClick={start}>
            Start game <span aria-hidden>→</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
