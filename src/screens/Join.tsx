import { useState } from 'react'
import { NAME_MAX } from '../../shared/protocol'
import { navigate } from '../App'
import { client, savedName, useClient } from '../net/client'
import { BrandMark, Button, Spinner } from '../ui/kit'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center px-5 sm:px-6">
          <button type="button" onClick={() => navigate('/')} aria-label="Home">
            <BrandMark />
          </button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-10">{children}</main>
    </div>
  )
}

export function JoinRoom({ code }: { code: string }) {
  const st = useClient()
  const [name, setName] = useState(savedName)
  const [busy, setBusy] = useState(false)
  const join = () => {
    if (!name.trim()) return client.toast('Enter your name to join.', 'error')
    setBusy(true)
    client.join(code, name.trim())
    setTimeout(() => setBusy(false), 3000)
  }
  return (
    <Shell>
      <section className="surface animate-rise w-full max-w-md rounded-xl p-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">You're invited</div>
        <h1 className="text-display mt-1 text-[34px] leading-tight text-fg">Join table</h1>
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/25 px-3 py-1.5 font-mono text-lg tracking-[0.3em] text-champagne">{code}</div>
        <label className="mt-6 block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Your name</span>
          <input
            value={name}
            autoFocus
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            placeholder="How your friends know you"
            autoComplete="nickname"
            className="mt-2 h-11 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3.5 text-[15px] text-fg placeholder:text-fg-4 focus:border-champagne/45 focus:outline-none"
          />
        </label>
        <Button variant="primary" size="xl" className="mt-4 w-full" onClick={join} disabled={busy || st.status !== 'open'}>
          {busy && <Spinner />} Take a seat <span aria-hidden>→</span>
        </Button>
      </section>
    </Shell>
  )
}

export function RoomMessage({ title, message, busy = false }: { title: string; message: string; busy?: boolean }) {
  return (
    <Shell>
      <section className="surface animate-rise w-full max-w-md rounded-xl p-6 text-center">
        {busy && <Spinner className="mb-4 text-champagne" />}
        <h1 className="text-display text-[30px] leading-tight text-fg">{title}</h1>
        <p className="mt-2 text-[14px] text-fg-2">{message}</p>
        {!busy && (
          <Button variant="primary" size="lg" className="mt-6" onClick={() => navigate('/')}>
            Back to start
          </Button>
        )}
      </section>
    </Shell>
  )
}
