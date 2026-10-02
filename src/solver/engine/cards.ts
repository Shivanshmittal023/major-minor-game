/**
 * Card model for Major–Minor.
 *
 * 48 cards (no 8s), split into 8 sets of 6. Cards are plain integers 0..47:
 *   setId  = floor(card / 6)       (0..3 = Minor ♠♥♦♣, 4..7 = Major ♠♥♦♣)
 *   rankIx = card % 6
 * Using integers keeps the inference engine fast (bitmasks, typed arrays).
 */

export type CardId = number
export type SetId = number

export const NUM_CARDS = 48
export const NUM_SETS = 8
export const CARDS_PER_SET = 6

export const SUITS = ['S', 'H', 'D', 'C'] as const
export type Suit = (typeof SUITS)[number]

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
export const SUIT_NAME: Record<Suit, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' }

export const MINOR_RANKS = ['2', '3', '4', '5', '6', '7'] as const
export const MAJOR_RANKS = ['9', '10', 'J', 'Q', 'K', 'A'] as const

export const ALL_CARDS: CardId[] = Array.from({ length: NUM_CARDS }, (_, i) => i)
export const ALL_SETS: SetId[] = Array.from({ length: NUM_SETS }, (_, i) => i)

export function setOf(card: CardId): SetId {
  return Math.floor(card / CARDS_PER_SET)
}

export function isMajorSet(set: SetId): boolean {
  return set >= 4
}

export function suitOfSet(set: SetId): Suit {
  return SUITS[set % 4]
}

export function suitOf(card: CardId): Suit {
  return suitOfSet(setOf(card))
}

export function isRed(card: CardId): boolean {
  const s = suitOf(card)
  return s === 'H' || s === 'D'
}

export function rankOf(card: CardId): string {
  const set = setOf(card)
  const ranks = isMajorSet(set) ? MAJOR_RANKS : MINOR_RANKS
  return ranks[card % CARDS_PER_SET]
}

export function cardsOfSet(set: SetId): CardId[] {
  const base = set * CARDS_PER_SET
  return [base, base + 1, base + 2, base + 3, base + 4, base + 5]
}

export function cardLabel(card: CardId): string {
  return rankOf(card) + SUIT_SYMBOL[suitOf(card)]
}

export function setLabel(set: SetId): string {
  return `${isMajorSet(set) ? 'Major' : 'Minor'} ${SUIT_NAME[suitOfSet(set)]}`
}

export function setShortLabel(set: SetId): string {
  return `${isMajorSet(set) ? 'Major' : 'Minor'} ${SUIT_SYMBOL[suitOfSet(set)]}`
}

export function makeCard(rank: string, suit: Suit): CardId | null {
  const suitIx = SUITS.indexOf(suit)
  const minorIx = (MINOR_RANKS as readonly string[]).indexOf(rank)
  if (minorIx >= 0) return suitIx * CARDS_PER_SET + minorIx
  const majorIx = (MAJOR_RANKS as readonly string[]).indexOf(rank)
  if (majorIx >= 0) return (4 + suitIx) * CARDS_PER_SET + majorIx
  return null
}

/**
 * Parse shorthand like "6s", "10h", "th", "QD", "a♣", "k c".
 * Returns null for anything invalid — including 8s, which are not in the deck.
 */
export function parseCard(input: string): CardId | null {
  const s = input.trim().toUpperCase().replace(/\s+/g, '')
  const m = /^(10|[2-9TJQKA])([SHDC♠♥♦♣])$/.exec(s)
  if (!m) return null
  const rank = m[1] === 'T' ? '10' : m[1]
  const suitChar = m[2]
  const suit = (
    { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' } as Record<string, Suit>
  )[suitChar] ?? (suitChar as Suit)
  return makeCard(rank, suit)
}

/** Display order for sets: group by suit, minor then major. */
export const SET_DISPLAY_ORDER: SetId[] = [0, 4, 1, 5, 2, 6, 3, 7]
