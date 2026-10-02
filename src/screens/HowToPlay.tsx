import { cardsOfSet, EXTRA_SET } from '../../shared/cards'
import { Card } from '../ui/Card'
import { TEAM_STYLE } from '../ui/kit'

/**
 * A first-timer's guide to Major–Minor, on the home page. Mirrors the fixed
 * house rules in shared/rules.ts — keep the two in step.
 */

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="text-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-champagne/40 text-lg leading-none text-champagne">{n}</span>
      <div className="min-w-0 pt-0.5">
        <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
        <div className="mt-1 space-y-2 text-[13px] leading-relaxed text-fg-2">{children}</div>
      </div>
    </div>
  )
}

function CardRow({ cards, label }: { cards: number[]; label: string }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">{label}</div>
      <div className="flex flex-wrap gap-1">
        {cards.map((c) => (
          <Card key={c} card={c} size="sm" />
        ))}
      </div>
    </div>
  )
}

export function HowToPlay() {
  return (
    <section id="rules" className="surface mt-5 scroll-mt-6 rounded-2xl">
      <header className="border-b border-white/[0.05] px-5 py-5 sm:px-7">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-champagne/80">New to the game?</div>
        <h2 className="text-display mt-1 text-[34px] leading-none text-fg sm:text-[40px]">
          How to play <em className="text-champagne">Major–Minor</em>
        </h2>
        <p className="mt-2 max-w-2xl text-[14px] text-fg-2">
          Two teams try to collect complete sets of six cards by asking the other team for them. Remember what people ask for — there's no history to look back on.
        </p>
      </header>

      <div className="grid gap-8 px-5 py-6 sm:px-7 lg:grid-cols-2 lg:gap-x-12">
        <div className="space-y-7">
          <Step n={1} title="Two teams, sitting alternately">
            <p>
              Play with <b className="font-medium text-fg">8 players (4 v 4)</b> or <b className="font-medium text-fg">6 players (3 v 3)</b>. Seats alternate between the teams —{' '}
              <span className={TEAM_STYLE[0].text}>Team 1</span>, <span className={TEAM_STYLE[1].text}>Team 2</span>, <span className={TEAM_STYLE[0].text}>Team 1</span>… — so your teammates are never next to you.
            </p>
            <p>You can see how many cards everyone holds, but only your own cards.</p>
          </Step>

          <Step n={2} title="The cards come in sets of six">
            <p>
              Each suit is split into two sets: <b className="font-medium text-fg">Minor</b> (2–7) and <b className="font-medium text-fg">Major</b> (9–A). That's 8 sets.
            </p>
            <div className="space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <CardRow label="Minor ♠ — one set" cards={cardsOfSet(0)} />
              <CardRow label="Major ♠ — another set" cards={cardsOfSet(4)} />
              <CardRow label="6-player games add a 9th set: 8s & Jokers" cards={cardsOfSet(EXTRA_SET)} />
            </div>
            <p>
              <b className="font-medium text-fg">8 players:</b> 48 cards (no 8s), 6 each. <b className="font-medium text-fg">6 players:</b> 54 cards (with the 8s and two Jokers), 9 each.
            </p>
          </Step>

          <Step n={3} title="On your turn, ask an opponent for one card">
            <p>
              Name the exact card, e.g. <i>"Rahul, do you have the 6♠?"</i> You may only ask for a card from a set you <b className="font-medium text-fg">already hold a card of</b>, you can't ask for a card you hold, and you can only ask the <b className="font-medium text-fg">other team</b>.
            </p>
            <p>
              <span className="text-sage">Got it?</span> The card is yours and you ask again. <span className="text-rose">Missed?</span> The turn passes to the player you asked.
            </p>
          </Step>
        </div>

        <div className="space-y-7">
          <Step n={4} title="Declare a set to win it">
            <p>
              At any time — even on someone else's turn — you can declare a set you hold at least one card of: say which teammate holds each of its six cards.
            </p>
            <p>
              <span className="text-sage">All six right:</span> your team wins the set. <span className="text-rose">Any card wrong</span> (with a different teammate, or actually with the other team): the <b className="font-medium text-fg">other team</b> wins it. Either way the cards are shown and leave the game.
            </p>
          </Step>

          <Step n={5} title="Most sets wins">
            <p>The game ends when every set has been won. The team with more sets wins (a 4–4 draw is possible with 8 players).</p>
            <p>Out of cards? You can't ask any more, so your turns are skipped — your teammates carry on for the team.</p>
          </Step>

          <div className="rounded-xl border border-champagne/20 bg-champagne/[0.04] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-champagne/80">Tips for your first game</div>
            <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-fg-2">
              <li className="flex gap-2.5">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-champagne/60" />
                <span>
                  Every ask gives something away: someone asking for the 6♠ must hold another Minor ♠ card — and doesn't hold the 6♠.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-champagne/60" />
                <span>A miss tells you the card isn't with that player — useful when you ask next.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-champagne/60" />
                <span>Only declare when you're sure where all six cards are — a wrong call hands the set to the other team.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-champagne/60" />
                <span>
                  Want to practise first? Start a table and tap <b className="font-medium text-fg">Fill with bots</b>.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
