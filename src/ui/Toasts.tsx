import type { ClientState } from '../net/client'

export function Toasts({ toasts }: { toasts: ClientState['toasts'] }) {
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="surface-raised animate-rise flex max-w-sm items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-[13px] text-fg">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.tone === 'error' ? 'bg-rose' : 'bg-champagne'}`} />
          {t.message}
        </div>
      ))}
    </div>
  )
}
