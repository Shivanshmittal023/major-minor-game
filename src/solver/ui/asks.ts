import { cardsOfSet, setOf, type CardId } from '../engine/cards'
import type { GameState } from '../engine/game'
import { teamOf, type PlayerId } from '../engine/types'

/** Can `requester` ask `target` at all? Only opponents who both still hold cards. */
export function canAsk(state: GameState, requester: PlayerId, target: PlayerId): boolean {
  const { handCounts } = state.timeline
  return requester !== target && teamOf(requester) !== teamOf(target) && handCounts[requester] > 0 && handCounts[target] > 0
}

/** Could `requester` legally ask for `c`, given everything known? */
export function cardAllowed(state: GameState, requester: PlayerId, c: CardId): boolean {
  const { setup, knowledge: kn, timeline: tl } = state
  const ck = kn.cards[c]
  if (ck.status === 'out') return false
  if (ck.owner === requester) return false
  const others = cardsOfSet(setOf(c)).filter((x) => x !== c)
  if (requester === setup.me) return others.some((x) => tl.myHand.has(x))
  return others.some((x) => kn.cards[x].possible.includes(requester))
}
