import { cardLabel, setLabel } from '../engine/cards'
import type { MoveSuggestion, Strength } from '../engine/recommend'
import { CardChip } from './CardChip'
import { useCtx } from './context'
import { pct } from './format'
import { Badge, Button, Check, Cross, Gauge, TeamDot } from './kit'

const STRENGTH: Record<Strength, string> = {
  certain: 'Certain',
  strong: 'Strong',
  moderate: 'Moderate',
  speculative: 'Speculative',
}

export function RecommendationPanel() {
  const { state, api, name } = useCtx()
  const { recommendation: rec, setup, timeline: tl } = state
  const myTurn = tl.nextTurn === setup.me
  const [best, ...alts] = rec.moves

  const record = (m: MoveSuggestion, success: boolean) => {
    const err = api.addEvent({ kind: 'ask', requester: setup.me, target: m.target, card: m.card, success })
    api.toast(err ? 'error' : 'info', err ?? `You asked ${name(m.target)} for ${cardLabel(m.card)} · ${success ? 'received' : 'missed'}`)
  }

  return (
    <section className={`surface relative flex flex-col overflow-hidden rounded-xl ${myTurn ? 'border-champagne/30' : ''}`}>
      {myTurn && <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(520px 220px at 100% 0%, rgb(230 210 162 / 0.09), transparent 70%)' }} />}
      <header className="relative flex min-h-12 items-center justify-between border-b border-white/[0.05] px-5 py-2.5">
        <div>
          <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Assistant</div>
          <h2 className="text-[13px] font-semibold text-fg">Recommended move</h2>
        </div>
        {myTurn ? <Badge tone="accent">Your move</Badge> : <span className="text-xs text-fg-3">For your next turn</span>}
      </header>

      {!best && <p className="relative p-5 text-[13px] text-fg-3">{rec.note}</p>}

      {best && (
        <div key={`${best.target}-${best.card}`} className="animate-rise relative p-5">
          <div className="flex items-center gap-4">
            <CardChip card={best.card} size="xl" variant="known" className="-rotate-[4deg] shadow-[0_18px_30px_-12px_rgba(0,0,0,0.85)]" />
            <div className="min-w-0 flex-1">
              <div className="text-display text-[30px] leading-[1.05] text-fg">
                Ask {name(best.target)}
                <br />
                <span className="text-fg-2">for</span> {cardLabel(best.card)}
              </div>
              <div className="mt-1.5 text-xs text-fg-3">{setLabel(best.set)}</div>
            </div>
            <Gauge
              value={best.probability}
              size={72}
              label={
                <div className="text-center leading-none">
                  <div className="text-display text-xl text-fg">{pct(best.probability)}</div>
                  <div className="mt-1 text-[8px] uppercase tracking-[0.12em] text-fg-4">{STRENGTH[best.strength]}</div>
                </div>
              }
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="hit" size="lg" onClick={() => record(best, true)}>
              <Check /> Got it
            </Button>
            <Button variant="miss" size="lg" onClick={() => record(best, false)}>
              <Cross /> Missed
            </Button>
          </div>

          <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-fg-2">
            {best.reasons.map((r, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-champagne/60" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
          {rec.note && <p className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-fg-3">{rec.note}</p>}
        </div>
      )}

      {alts.length > 0 && (
        <div className="relative mt-auto border-t border-white/[0.05] px-2 pb-2 pt-3">
          <div className="px-3 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Alternatives</div>
          {alts.map((m, i) => (
            <div key={i} className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.03]">
              <CardChip card={m.card} size="sm" variant="known" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px] text-fg">
                  <TeamDot player={m.target} /> {name(m.target)}
                </div>
                <div className="truncate text-[11px] text-fg-3" title={m.reasons.join('\n')}>
                  {m.reasons[2] ?? m.reasons[1]}
                </div>
              </div>
              <span className="font-mono text-xs text-fg-2 group-hover:hidden">{pct(m.probability)}</span>
              <div className="hidden gap-1 group-hover:flex">
                <button type="button" title="Asked — got it" onClick={() => record(m, true)} className="rounded-md p-1.5 text-sage hover:bg-sage/10">
                  <Check />
                </button>
                <button type="button" title="Asked — missed" onClick={() => record(m, false)} className="rounded-md p-1.5 text-rose hover:bg-rose/10">
                  <Cross />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
