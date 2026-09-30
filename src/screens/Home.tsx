import { useState } from 'react'
import { parseCard } from '../../shared/cards'
import { CODE_LENGTH, NAME_MAX } from '../../shared/protocol'
import { MODES, teamOfSeat, type TableSize } from '../../shared/rules'
import { navigate } from '../App'
import { client, savedName, useClient } from '../net/client'
import { Card } from '../ui/Card'
import { BrandMark, Button, Spinner, TEAM_STYLE } from '../ui/kit'

const HERO = ['as', 'kh', '9d', 'qc', '7s'].map((c) => parseCard(c)!)

export function Home() {
  const st = useClient()
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [size, setSize] = useState<TableSize>(8)

  const create = () => {
    if (!name.trim()) return client.toast('Enter your name to host a table.', 'error')
    setCreating(true)
    client.create(name.trim(), size)
    setTimeout(() => setCreating(false), 4000)
  }
  const join = () => {
    const c = code.trim().toUpperCase()
    if (c.length !== CODE_LENGTH) return client.toast(`Game codes are ${CODE_LENGTH} characters.`, 'error')
    navigate(`/r/${c}`)
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 sm:px-6">
          <BrandMark />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-4">6 or 8 players · 2 teams</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-champagne/80">Online · real time · every player on their own device</div>
            <h1 className="text-display mt-3 text-[52px] leading-[0.92] text-fg sm:text-[76px]">
              Deal in your <em className="text-champagne">friends.</em>
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-fg-2">
              Host a table, share the link, and play Major–Minor together — three against three or four against four, each on their own phone or laptop. The server deals, keeps every hand private and referees every ask.
            </p>
          </div>
          <div className="relative hidden h-[240px] items-center justify-center lg:flex">
            <div className="absolute h-24 w-[70%] rounded-[50%] bg-black/50 blur-2xl" style={{ bottom: 10 }} />
            {HERO.map((c, i) => (
              <div key={c} className="animate-rise" style={{ marginLeft: i ? -40 : 0, transform: `rotate(${-18 + i * 9}deg) translateY(${Math.abs(i - 2) * 10}px)`, transformOrigin: '50% 130%', animationDelay: `${i * 70}ms` }}>
                <Card card={c} size="2xl" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <section className="surface rounded-xl p-5 sm:p-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Host</div>
            <h2 className="text-display mt-1 text-[28px] leading-tight text-fg">Start a new table</h2>
            <p className="mt-1 text-[13px] text-fg-3">You'll get a code and a link to send to your friends.</p>
            <div className="mt-5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Table size</span>
              <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Table size">
                {([8, 6] as TableSize[]).map((n) => (
                  <ModeTile key={n} n={n} selected={size === n} onSelect={() => setSize(n)} />
                ))}
              </div>
            </div>
            <label className="mt-5 block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Your name</span>
              <input
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="e.g. Asha"
                autoComplete="nickname"
                className="mt-2 h-11 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3.5 text-[15px] text-fg placeholder:text-fg-4 focus:border-champagne/45 focus:outline-none"
              />
            </label>
            <Button variant="primary" size="xl" className="mt-4 w-full" onClick={create} disabled={creating || st.status !== 'open'}>
              {creating ? <Spinner /> : null} Create game <span aria-hidden>→</span>
            </Button>
          </section>

          <section className="surface rounded-xl p-5 sm:p-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Join</div>
            <h2 className="text-display mt-1 text-[28px] leading-tight text-fg">Have a code?</h2>
            <p className="mt-1 text-[13px] text-fg-3">Or just open the link your host sent you.</p>
            <label className="mt-5 block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Game code</span>
              <input
                value={code}
                maxLength={CODE_LENGTH}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && join()}
                placeholder="ABC123"
                autoCapitalize="characters"
                autoComplete="off"
                className="mt-2 h-11 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3.5 font-mono text-lg tracking-[0.35em] text-fg placeholder:tracking-[0.35em] placeholder:text-fg-4 focus:border-champagne/45 focus:outline-none"
              />
            </label>
            <Button size="xl" className="mt-4 w-full" onClick={join}>
              Find table
            </Button>
          </section>
        </div>
      </main>
    </div>
  )
}

function ModeTile({ n, selected, onSelect }: { n: TableSize; selected: boolean; onSelect: () => void }) {
  const m = MODES[n]
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border p-3 text-left transition-all duration-150 ${
        selected ? 'border-champagne/50 bg-champagne/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'border-white/[0.07] bg-black/20 hover:border-white/15'
      }`}
    >
      {/* miniature table: alternating team seats */}
      <span className="relative h-11 w-11 shrink-0">
        <span className="absolute inset-[9px] rounded-full border border-white/[0.08]" style={{ background: 'radial-gradient(circle at 50% 35%, #1b2130, #0b0d12)' }} />
        {Array.from({ length: n }).map((_, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
          return (
            <span
              key={i}
              className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${50 + 42 * Math.cos(a)}%`, top: `${50 + 42 * Math.sin(a)}%`, background: TEAM_STYLE[teamOfSeat(i)].hex, opacity: selected ? 1 : 0.6 }}
            />
          )
        })}
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-1.5">
          <span className={`text-display text-[30px] leading-none ${selected ? 'text-champagne' : 'text-fg'}`}>{n}</span>
          <span className="text-[13px] text-fg">players</span>
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-fg-3">{m.detail}</span>
        {n === 6 && <span className="mt-0.5 block text-[10px] text-fg-4">+ 8s & Jokers set</span>}
      </span>
    </button>
  )
}
