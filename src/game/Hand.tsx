import { isRedSet, setGlyph, setKindShort, setLabel, setOf, type SetId } from '../../shared/cards'
import { Card } from '../ui/Card'
import { useNewKeys } from '../ui/kit'
import { REVEAL_MS, type View } from './view'

/** Your hand as a real fan of cards. Tapping a card focuses its set in the ask panel. */
export function Hand({ v, compact, focusSet, onFocusSet }: { v: View; compact: boolean; focusSet: SetId | null; onFocusSet: (s: SetId | null) => void }) {
  const cards = v.hand
  const fresh = useNewKeys(cards)
  const n = cards.length
  const cardW = compact ? 48 : 74
  const maxWidth = compact ? Math.min(window.innerWidth - 32, 420) : 760
  // Overlap so the fan always fits, but never spread wider than feels natural.
  const step = n > 1 ? Math.min(compact ? 30 : 48, (maxWidth - cardW) / (n - 1)) : 0
  const spread = Math.min(compact ? 22 : 30, 4 + n * 3)
  const angleStep = n > 1 ? spread / (n - 1) : 0

  if (v.me === null) return null

  return (
    <div>
      {!compact && (
        <div className="mb-1 flex items-center justify-between px-1">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Your hand</span>
            <span className="text-xs text-fg-3">{n} card{n === 1 ? '' : 's'} · {v.askable.length} set{v.askable.length === 1 ? '' : 's'} to ask from</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {v.askable.map(({ set, have }) => (
              <button
                key={set}
                type="button"
                onClick={() => onFocusSet(focusSet === set ? null : set)}
                className={`inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] transition-colors ${
                  focusSet === set ? 'border-champagne/45 bg-champagne/10 text-champagne' : 'border-white/[0.07] bg-white/[0.02] text-fg-3 hover:text-fg-2'
                }`}
              >
                <span className={isRedSet(set) ? 'text-rose' : 'text-fg-2'}>{setGlyph(set)}</span>
                {setKindShort(set)} <span className="font-mono text-[10px] text-fg-4">{have.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={`relative flex items-end justify-center ${compact ? 'h-[92px]' : 'h-[140px] pt-5'}`}>
        <div className="pointer-events-none absolute inset-x-[15%] bottom-2 h-10 rounded-[50%] bg-black/45 blur-xl" />
        {n === 0 && <p className="self-center text-[13px] text-fg-3">You're out of cards — your team plays on.</p>}
        {cards.map((c, i) => {
          const angle = n > 1 ? -spread / 2 + i * angleStep : 0
          const set = setOf(c)
          const dim = focusSet !== null && set !== focusSet
          return (
            <button
              type="button"
              key={c}
              onClick={() => onFocusSet(focusSet === set ? null : set)}
              className="relative transition-all duration-200 hover:z-30 hover:!-translate-y-4 focus-visible:outline-none"
              style={{
                marginLeft: i === 0 ? 0 : step - cardW,
                transform: `translateY(${Math.abs(angle) * (compact ? 0.4 : 0.6) - (focusSet === set ? 12 : 0)}px) rotate(${angle}deg)`,
                transformOrigin: '50% 130%',
                zIndex: i,
                opacity: dim ? 0.55 : 1,
              }}
              aria-label={`Focus ${setLabel(set)}`}
            >
              <Card card={c} size={compact ? 'lg' : 'xl'} fresh={fresh.has(c)} style={fresh.has(c) ? { animationDelay: `${REVEAL_MS + 900}ms` } : undefined} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
