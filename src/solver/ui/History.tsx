import { useEffect, useRef } from 'react'
import { useCtx } from './context'
import { describeEvent } from './format'

/** The event log; lives in the details panel's "History" tab. */
export function HistoryList() {
  const { state, api } = useCtx()
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.events.length])

  return (
    <div>
      <div ref={scrollRef} className="max-h-[520px] overflow-y-auto px-4 py-3 sm:px-5">
        {state.events.length === 0 && <p className="py-8 text-center text-[13px] text-fg-4">The log is empty. Tap a player on the table to record the first ask.</p>}
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
    </div>
  )
}
