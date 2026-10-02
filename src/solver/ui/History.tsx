import { useEffect, useRef } from 'react'
import { useCtx } from './context'
import { describeEvent } from './format'
import { Button } from './kit'

export function HistoryPanel() {
  const { state, api } = useCtx()
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.events.length])

  return (
    <section className="surface flex h-full min-h-0 flex-col rounded-xl">
      <header className="flex min-h-12 shrink-0 items-center justify-between border-b border-white/[0.05] px-5 py-2.5">
        <div>
          <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Log</div>
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-[13px] font-semibold text-fg">Game history</h2>
            <span className="text-xs text-fg-3">{state.events.length} events</span>
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={!state.events.length} onClick={api.undo} title="Undo (⌘Z)">Undo</Button>
          <Button size="sm" variant="ghost" disabled={!api.canRedo} onClick={api.redo} title="Redo (⇧⌘Z)">Redo</Button>
        </div>
      </header>
      <div ref={scrollRef} className="max-h-[420px] min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {state.events.length === 0 && <p className="py-8 text-center text-[13px] text-fg-4">The log is empty. Record the first ask above.</p>}
        <ol className="relative">
          {state.events.length > 1 && <span className="absolute bottom-3 left-[11px] top-3 w-px bg-white/[0.06]" />}
          {state.events.map((ev, i) => {
            const d = describeEvent(state.setup, ev)
            const found = api.insights[ev.id] ?? []
            const dot = d.ok === true ? 'bg-sage' : d.ok === false ? 'bg-rose' : 'bg-champagne'
            const latest = i === state.events.length - 1
            return (
              <li key={ev.id} className={`relative flex gap-3.5 py-2 ${latest ? 'animate-rise' : ''}`}>
                <span className="relative z-10 mt-[3px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-ink-850">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] text-fg-4">T{i + 1}</span>
                    <span className="truncate text-[13px] text-fg">{d.title}</span>
                  </div>
                  {d.result && <div className={`mt-0.5 text-xs ${d.ok === true ? 'text-sage/90' : d.ok === false ? 'text-rose/90' : 'text-fg-3'}`}>{d.result}</div>}
                  {found.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 rounded-md border border-champagne/15 bg-champagne/[0.04] px-2 py-1.5">
                      {found.slice(0, 4).map((f, j) => (
                        <div key={j} className="text-[11px] leading-snug text-champagne/90">{f}</div>
                      ))}
                      {found.length > 4 && <div className="text-[11px] text-fg-4">+{found.length - 4} more deductions</div>}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
