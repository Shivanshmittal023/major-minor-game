import { useEffect, useMemo, useRef, useState } from 'react'
import { cardLabel, cardsOfSet, parseCard, setLabel, type CardId, type SetId } from '../engine/cards'
import { isRedSet, setGlyph, setKind } from '../engine/cards'
import { playersOfTeam, teamLabel, teamOf, type PlayerId, type TeamId, seatsOf, setsOf } from '../engine/types'
import { canAsk, cardAllowed as isAllowed } from './asks'
import { CardChip } from './CardChip'
import { useCtx } from './context'
import { pct } from './format'
import { Avatar, Button, Check, Cross, Kbd, Segmented, TeamDot } from './kit'

type Mode = 'ask' | 'declare' | 'fact'

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

/** Manual recording tools, shown in a sheet: full ask form (with typed entry), lay down a set, observation. */
export function EventComposer({ initial = 'ask', onClose }: { initial?: Mode; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(initial)
  const { state, composerRequest } = useCtx()
  useEffect(() => {
    if (composerRequest) setMode(composerRequest.mode)
  }, [composerRequest])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'a') setMode('ask')
      else if (e.key === 'd') setMode('declare')
      else if (e.key === 'f') setMode('fact')
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-6" onClick={onClose}>
    <div className="animate-rise max-h-[90dvh] w-full max-w-[1100px] overflow-y-auto rounded-t-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
    <section className="surface-raised relative rounded-t-2xl sm:rounded-2xl">
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/[0.05] px-4 py-2.5 sm:px-5">
        <div>
          <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">Record manually</div>
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-[13px] font-semibold text-fg">Record turn</h2>
            <span className="font-mono text-xs text-fg-3">T{state.events.length + 1}</span>
          </div>
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'ask', label: <><span className="sm:hidden">Ask</span><span className="hidden sm:inline">Card request</span> <span className="hidden sm:inline-flex"><Kbd>A</Kbd></span></> },
            { value: 'declare', label: <><span className="sm:hidden">Lay down</span><span className="hidden sm:inline">Lay down set</span> <span className="hidden sm:inline-flex"><Kbd>D</Kbd></span></> },
            { value: 'fact', label: <><span className="sm:hidden">Fact</span><span className="hidden sm:inline">Observation</span> <span className="hidden sm:inline-flex"><Kbd>F</Kbd></span></> },
          ]}
        />
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="ml-auto sm:ml-0">
          <Cross />
        </Button>
      </header>
      <div className="p-4 sm:p-5">
        {mode === 'ask' && <AskForm />}
        {mode === 'declare' && <DeclareForm key={composerRequest?.nonce ?? 0} initialSet={composerRequest?.set} onDone={onClose} />}
        {mode === 'fact' && <FactForm onDone={onClose} />}
      </div>
    </section>
    </div>
    </div>
  )
}

function FieldLabel({ children, step }: { children: React.ReactNode; step?: number }) {
  return (
    <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">
      {step !== undefined && <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white/10 text-[9px] text-fg-3">{step}</span>}
      {children}
    </div>
  )
}

function PlayerPill({ p, selected, onClick, disabled, hint }: { p: PlayerId; selected: boolean; onClick: () => void; disabled?: boolean; hint?: string }) {
  const { name, state } = useCtx()
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={hint}
      className={`inline-flex h-8 items-center gap-2 rounded-lg border pl-1 pr-2.5 text-[13px] transition-all duration-150 ${
        selected
          ? 'border-champagne/50 bg-champagne/[0.09] text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'border-white/[0.07] bg-white/[0.02] text-fg-2 hover:border-white/15 hover:bg-white/[0.05] hover:text-fg'
      } disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-white/[0.02]`}
    >
      <Avatar name={name(p)} player={p} size={22} active={false} />
      {name(p)}
      <span className="font-mono text-[10px] text-fg-4">{p + 1}</span>
      {state.timeline.nextTurn === p && !selected && <span className="h-1 w-1 rounded-full bg-champagne" />}
    </button>
  )
}

export function CardGrid({ selected, onPick, allowed, onlyAllowed = false }: { selected: CardId | null; onPick: (c: CardId) => void; allowed: (c: CardId) => boolean; onlyAllowed?: boolean }) {
  const { state } = useCtx()
  const sets = state.knowledge.sets
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2 2xl:grid-cols-4">
      {setsOf(state.setup).map((s) => {
        const red = isRedSet(s)
        const head = (
          <div className="mb-1 flex items-center gap-1 text-[11px] text-fg-3">
            <span className={red ? 'text-rose' : 'text-fg-2'}>{setGlyph(s)}</span>
            {setKind(s)}
          </div>
        )
        if (onlyAllowed && !cardsOfSet(s).some(allowed)) return null
        // Laid-down sets are off the table: keep their slot so the grid never reflows mid-game.
        if (sets[s].laidDownBy !== null)
          return (
            <div key={s} className="opacity-60">
              {head}
              <div className="flex h-7 items-center gap-1.5 rounded-[5px] border border-dashed border-white/[0.08] px-2 text-[11px] text-fg-4">
                <TeamDot team={sets[s].laidDownBy!} size={5} /> Off the table · {teamLabel(sets[s].laidDownBy!)}
              </div>
            </div>
          )
        return (
          <div key={s}>
            {head}
            <div className="flex flex-wrap gap-1">
              {cardsOfSet(s).map((c) => (
                <CardChip key={c} card={c} size="sm" variant="token" selected={selected === c} disabled={!allowed(c)} onClick={() => onPick(c)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card request
// ---------------------------------------------------------------------------

interface Parsed {
  requester?: PlayerId
  target?: PlayerId
  card?: CardId
  outcome?: boolean
  error?: string
}

function parseCommand(input: string, players: string[], me: PlayerId): Parsed {
  const out: Parsed = {}
  let tokens = input.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return out
  // "25 6s y" — two seat digits glued together
  if (/^[1-8]{2}$/.test(tokens[0])) tokens = [tokens[0][0], tokens[0][1], ...tokens.slice(1)]
  const player = (t: string): PlayerId | undefined => {
    const lt = t.toLowerCase()
    if (/^[1-8]$/.test(t)) return +t - 1
    if (lt === 'me' || lt === 'i') return me
    const hits = players.map((p, i) => [p.toLowerCase(), i] as const).filter(([p]) => p.startsWith(lt))
    return hits.length === 1 ? hits[0][1] : undefined
  }
  const pl: PlayerId[] = []
  for (const t of tokens) {
    const lt = t.toLowerCase()
    if (['y', 'yes', '+', '✓', 'had'].includes(lt)) out.outcome = true
    else if (['n', 'no', '-', 'x', '✗'].includes(lt)) out.outcome = false
    else if (parseCard(t) !== null) out.card = parseCard(t)!
    else if (/^[a-z]*8[shdc♠♥♦♣]$/i.test(t)) out.error = 'There are no 8s in this deck.'
    else {
      const p = player(t)
      if (p === undefined) out.error = `Don't understand "${t}"`
      else pl.push(p)
    }
  }
  if (pl[0] !== undefined) out.requester = pl[0]
  if (pl[1] !== undefined) out.target = pl[1]
  return out
}

function AskForm() {
  const { state, api, name } = useCtx()
  const { setup, knowledge: kn, timeline: tl } = state
  const [reqOverride, setReqOverride] = useState<PlayerId | null>(null)
  const [target, setTarget] = useState<PlayerId | null>(null)
  const [card, setCard] = useState<CardId | null>(null)
  const [cmd, setCmd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cmdRef = useRef<HTMLInputElement>(null)
  const requester = reqOverride ?? tl.nextTurn

  const canTarget = (p: PlayerId) => canAsk(state, requester, p)
  const cardAllowed = (c: CardId) => isAllowed(state, requester, c)

  const reset = () => {
    setReqOverride(null)
    setTarget(null)
    setCard(null)
    setCmd('')
  }

  const submit = (success: boolean) => {
    if (target === null || card === null) {
      setError('Pick who was asked and which card.')
      return
    }
    const err = api.addEvent({ kind: 'ask', requester, target, card, success })
    if (err) {
      setError(err)
      return
    }
    api.toast('info', `${name(requester)} → ${name(target)} · ${cardLabel(card)} · ${success ? 'transferred' : 'not held'}`)
    setError(null)
    reset()
  }

  // When I'm the target, the outcome is fully determined by my hand.
  const forced: boolean | null = target === setup.me && card !== null ? tl.myHand.has(card) : null
  const pTarget = target !== null && card !== null ? kn.cards[card].prob[target] : null

  const onCmd = (v: string) => {
    setCmd(v)
    const p = parseCommand(v, setup.players, setup.me)
    setError(p.error ?? null)
    if (p.requester !== undefined) setReqOverride(p.requester)
    if (p.target !== undefined) setTarget(p.target)
    else if (p.requester !== undefined) setTarget(null)
    if (p.card !== undefined) setCard(p.card)
  }
  const onCmdKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const p = parseCommand(cmd, setup.players, setup.me)
      const outcome = p.outcome ?? forced
      if (outcome === null || outcome === undefined) setError('Add y (had it) or n (didn’t), or use the buttons.')
      else submit(outcome)
    } else if (e.key === 'Escape') {
      reset()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') {
        e.preventDefault()
        cmdRef.current?.focus()
      } else if (e.key === 'y') {
        if (target !== null && card !== null && forced !== false) submit(true)
      } else if (e.key === 'n') {
        if (target !== null && card !== null && forced !== true) submit(false)
      } else if (e.key === 'Escape') reset()
      else if (/^Digit[1-8]$/.test(e.code)) {
        const p = +e.code.slice(5) - 1
        if (e.shiftKey) {
          setReqOverride(p)
          setTarget(null)
        } else if (canTarget(p)) setTarget(p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pickRequester = (p: PlayerId) => {
    setReqOverride(p)
    if (target !== null && (target === p || teamOf(target) === teamOf(p))) setTarget(null)
  }

  const ready = target !== null && card !== null

  return (
    <div className="space-y-5">
      <div className="hidden h-11 items-center gap-3 rounded-lg border border-white/[0.08] bg-black/30 px-3.5 md:flex shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] transition-colors focus-within:border-champagne/45">
        <span className="font-mono text-sm text-champagne/70">›</span>
        <input
          ref={cmdRef}
          value={cmd}
          onChange={(e) => onCmd(e.target.value)}
          onKeyDown={onCmdKey}
          placeholder="Type a turn —  2 5 6s y  means seat 2 asked seat 5 for 6♠ and got it"
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[13px] text-fg placeholder:font-sans placeholder:text-fg-4 focus:outline-none"
        />
        <Kbd>/</Kbd>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)_230px]">
        <div className="space-y-4">
          <div>
            <FieldLabel step={1}>Asker</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {seatsOf(state.setup).map((p) => (
                <PlayerPill key={p} p={p} selected={p === requester} onClick={() => pickRequester(p)} disabled={tl.handCounts[p] === 0} hint={p === tl.nextTurn ? 'Whose turn it is by the rules' : undefined} />
              ))}
            </div>
          </div>
          <div>
            <FieldLabel step={2}>Asked</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {seatsOf(state.setup)
                .filter((p) => p !== requester)
                .map((p) => (
                  <PlayerPill key={p} p={p} selected={p === target} onClick={() => setTarget(p)} disabled={!canTarget(p)} />
                ))}
            </div>
          </div>
        </div>

        <div>
          <FieldLabel step={3}>Card</FieldLabel>
          <CardGrid selected={card} onPick={setCard} allowed={cardAllowed} />
        </div>

        <div className="flex flex-col">
          <FieldLabel step={4}>Outcome</FieldLabel>
          <div className="flex flex-1 flex-col gap-2">
            <Button variant="hit" size="xl" className="flex-1 justify-between" disabled={!ready || forced === false} onClick={() => submit(true)}>
              <span className="flex items-center gap-2"><Check /> Had it</span> <Kbd onLight>Y</Kbd>
            </Button>
            <Button variant="miss" size="xl" className="flex-1 justify-between" disabled={!ready || forced === true} onClick={() => submit(false)}>
              <span className="flex items-center gap-2"><Cross /> Didn't have it</span> <Kbd>N</Kbd>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-9 items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3.5 py-2 text-[13px]">
        {error ? (
          <span className="text-rose">{error}</span>
        ) : ready ? (
          <span className="flex flex-wrap items-center gap-x-2 text-fg-2">
            <span className="text-fg">{name(requester)}</span> asks <span className="text-fg">{name(target!)}</span> for
            <CardChip card={card!} size="xs" variant="known" />
            <span className="text-fg-3">
              {forced !== null
                ? forced ? '· you hold it, so you hand it over' : "· you don't hold it"
                : pTarget !== null && `· ${pct(pTarget)} estimated chance`}
            </span>
          </span>
        ) : (
          <>
          <span className="text-fg-4 md:hidden">Pick the asker, who was asked, the card, then the outcome — or tap a seat on the table.</span>
          <span className="hidden flex-wrap items-center gap-1.5 text-fg-4 md:flex">
            <Kbd>1–8</Kbd> asked <span className="mx-1 text-fg-4/50">·</span> <Kbd>⇧1–8</Kbd> asker <span className="mx-1 text-fg-4/50">·</span> <Kbd>Y</Kbd>
            <Kbd>N</Kbd> outcome <span className="mx-1 text-fg-4/50">·</span> <Kbd>⌘Z</Kbd> undo
          </span>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lay down a set
// ---------------------------------------------------------------------------

function DeclareForm({ onDone, initialSet }: { onDone: () => void; initialSet?: SetId }) {
  const { state, api, name } = useCtx()
  const kn = state.knowledge
  const firstOpen = setsOf(state.setup).find((s) => kn.sets[s].laidDownBy === null) ?? 0
  const [set, setSet] = useState<SetId>(
    initialSet !== undefined && kn.sets[initialSet].laidDownBy === null
      ? initialSet
      : (setsOf(state.setup).find((s) => kn.sets[s].heldBy !== null && kn.sets[s].laidDownBy === null) ?? firstOpen),
  )
  const suggestedTeam = (s: SetId): TeamId => {
    const sk = kn.sets[s]
    if (sk.heldBy !== null) return sk.heldBy
    return sk.expectedByTeam[0] >= sk.expectedByTeam[1] ? 0 : 1
  }
  const [team, setTeam] = useState<TeamId>(suggestedTeam(set))
  const defaults = useMemo(
    () =>
      cardsOfSet(set).map((c) => {
        const inTeam = kn.cards[c].possible.filter((p) => teamOf(p) === team)
        return inTeam.length === 1 ? inTeam[0] : -1
      }),
    [set, team, kn],
  )
  const [holders, setHolders] = useState<number[]>(defaults)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setHolders(defaults)
  }, [defaults])

  const submit = () => {
    if (holders.some((h) => h < 0)) {
      setError('Choose who laid down each card.')
      return
    }
    const err = api.addEvent({ kind: 'declare', team, set, holders })
    if (err) setError(err)
    else onDone()
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4">
          <div>
            <FieldLabel step={1}>Set</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {setsOf(state.setup).map((s) => {
                const red = isRedSet(s)
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={kn.sets[s].laidDownBy !== null}
                    onClick={() => {
                      setSet(s)
                      setTeam(suggestedTeam(s))
                    }}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-all ${
                      s === set ? 'border-champagne/50 bg-champagne/[0.09] text-fg' : 'border-white/[0.07] bg-white/[0.02] text-fg-2 hover:border-white/15 hover:text-fg'
                    } disabled:opacity-25`}
                    title={kn.sets[s].heldBy !== null ? 'Proven to be held entirely by one team' : undefined}
                  >
                    <span className={red ? 'text-rose' : 'text-fg'}>{setGlyph(s)}</span>
                    {setKind(s)}
                    {kn.sets[s].heldBy !== null && <span className="h-1 w-1 rounded-full bg-champagne" />}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <FieldLabel step={2}>Team</FieldLabel>
            <Segmented
              value={String(team)}
              onChange={(v) => setTeam(+v as TeamId)}
              options={[0, 1].map((t) => ({ value: String(t), label: <><TeamDot team={t as TeamId} /> {teamLabel(t as TeamId)}</> }))}
            />
          </div>
        </div>
        <div>
          <FieldLabel step={3}>Who laid down each card</FieldLabel>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {cardsOfSet(set).map((c, i) => (
              <label key={c} className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-1.5 pr-2 transition-colors focus-within:border-champagne/45">
                <CardChip card={c} size="md" variant="known" />
                <select
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-fg focus:outline-none [&>option]:bg-ink-800"
                  value={holders[i]}
                  onChange={(e) => setHolders((h) => h.map((x, j) => (j === i ? +e.target.value : x)))}
                >
                  <option value={-1}>Who held it?</option>
                  {playersOfTeam(team, state.setup.players.length).map((p) => (
                    <option key={p} value={p} disabled={!kn.cards[c].possible.includes(p)}>
                      {name(p)}
                      {!kn.cards[c].possible.includes(p) ? ' (impossible)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 border-t border-white/[0.05] pt-4">
        <p className="min-w-0 flex-1 text-xs text-fg-3">
          {error ? (
            <span className="text-[13px] text-rose">{error}</span>
          ) : (
            'Sets are detected automatically once a team provably holds all six. Record the lay-down so the assistant knows exactly who held what.'
          )}
        </p>
        <Button variant="primary" size="lg" onClick={submit}>
          Record {setLabel(set)} for {teamLabel(team)}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Direct observation
// ---------------------------------------------------------------------------

function FactForm({ onDone }: { onDone: () => void }) {
  const { state, api, name } = useCtx()
  const others = seatsOf(state.setup).filter((p) => p !== state.setup.me)
  const [player, setPlayer] = useState<PlayerId>(others[0])
  const [card, setCard] = useState<CardId | null>(null)
  const [has, setHas] = useState(true)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (card === null) return setError('Pick a card.')
    const err = api.addEvent({ kind: 'fact', player, card, has, note: note.trim() || undefined })
    if (err) setError(err)
    else onDone()
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4">
          <div>
            <FieldLabel step={1}>Player</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {others.map((p) => (
                <PlayerPill key={p} p={p} selected={p === player} onClick={() => setPlayer(p)} />
              ))}
            </div>
          </div>
          <div>
            <FieldLabel step={2}>Observation</FieldLabel>
            <Segmented
              value={has ? 'has' : 'not'}
              onChange={(v) => setHas(v === 'has')}
              options={[
                { value: 'has', label: 'Has the card' },
                { value: 'not', label: "Doesn't have it" },
              ]}
            />
          </div>
          <div>
            <FieldLabel>Note</FieldLabel>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — e.g. card was shown while shuffling"
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 text-[13px] text-fg placeholder:text-fg-4 focus:border-champagne/45 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <FieldLabel step={3}>Card</FieldLabel>
          <CardGrid selected={card} onPick={setCard} allowed={(c) => state.knowledge.cards[c].status !== 'out'} />
        </div>
      </div>
      <div className="flex items-center gap-4 border-t border-white/[0.05] pt-4">
        <div className="min-w-0 flex-1 text-[13px] text-rose">{error}</div>
        <Button variant="primary" size="lg" onClick={submit}>
          Record: {name(player)} {has ? 'has' : "doesn't have"} {card !== null ? cardLabel(card) : '…'}
        </Button>
      </div>
    </div>
  )
}
