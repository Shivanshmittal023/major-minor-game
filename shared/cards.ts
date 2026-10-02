/**
 * Card model for Major–Minor.
 *
 * Cards are integers. Sets 0–7 are the classic sets (cards 0–47); set 8 is the
 * extra set used only at 6-player tables (cards 48–53):
 *   setId  = floor(card / 6)   0..3 Minor ♠♥♦♣ · 4..7 Major ♠♥♦♣ · 8 Eights & Jokers
 *   index  = card % 6
 * The 8-player deck is exactly cards 0–47, unchanged.
 */

export type CardId = number
export type SetId = number

export const CARDS_PER_SET = 6
/** Classic 8-player deck (no 8s). */
export const NUM_CARDS = 48
export const NUM_SETS = 8
/** The extra set: 8♠ 8♥ 8♦ 8♣, Colourful Joker, Colourless Joker. */
export const EXTRA_SET: SetId = 8
export const JOKER_COLOURFUL: CardId = 52
export const JOKER_COLOURLESS: CardId = 53

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

export function isExtraSet(set: SetId): boolean {
  return set === EXTRA_SET
}

export function isJoker(card: CardId): boolean {
  return card === JOKER_COLOURFUL || card === JOKER_COLOURLESS
}

export function isMajorSet(set: SetId): boolean {
  return set >= 4 && set < EXTRA_SET
}

/** Suit of a classic set. (The extra set mixes suits — use setGlyph / isRedSet for display.) */
export function suitOfSet(set: SetId): Suit {
  return SUITS[set % 4]
}

/** Suit of a card, or null for a Joker. */
export function suitOf(card: CardId): Suit | null {
  if (isJoker(card)) return null
  if (setOf(card) === EXTRA_SET) return SUITS[card % CARDS_PER_SET]
  return suitOfSet(setOf(card))
}

export function isRed(card: CardId): boolean {
  if (card === JOKER_COLOURFUL) return true
  const s = suitOf(card)
  return s === 'H' || s === 'D'
}

export function rankOf(card: CardId): string {
  const set = setOf(card)
  if (set === EXTRA_SET) return isJoker(card) ? 'JK' : '8'
  const ranks = isMajorSet(set) ? MAJOR_RANKS : MINOR_RANKS
  return ranks[card % CARDS_PER_SET]
}

/** The symbol printed on a card: its suit, ★ for the Colourful Joker, ☆ for the Colourless Joker. */
export function pipOf(card: CardId): string {
  if (card === JOKER_COLOURFUL) return '★'
  if (card === JOKER_COLOURLESS) return '☆'
  return SUIT_SYMBOL[suitOf(card)!]
}

export function cardsOfSet(set: SetId): CardId[] {
  const base = set * CARDS_PER_SET
  return [base, base + 1, base + 2, base + 3, base + 4, base + 5]
}

export function cardLabel(card: CardId): string {
  if (card === JOKER_COLOURFUL) return 'Colourful Joker'
  if (card === JOKER_COLOURLESS) return 'Colourless Joker'
  return rankOf(card) + pipOf(card)
}

const RANK_NAME: Record<string, string> = { J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' }

/** The card spelt out, so nobody mistakes ♠ for ♣: "6 of Spades", "Queen of Hearts", "Colourful Joker". */
export function cardName(card: CardId): string {
  if (card === JOKER_COLOURFUL || card === JOKER_COLOURLESS) return cardLabel(card)
  const r = rankOf(card)
  return `${RANK_NAME[r] ?? r} of ${SUIT_NAME[suitOf(card)!]}`
}

/** Short token for tight spaces (history lines, banners). */
export function cardShort(card: CardId): string {
  if (card === JOKER_COLOURFUL) return 'JK★'
  if (card === JOKER_COLOURLESS) return 'JK☆'
  return cardLabel(card)
}

export function setLabel(set: SetId): string {
  if (set === EXTRA_SET) return 'Eights & Jokers'
  return `${isMajorSet(set) ? 'Major' : 'Minor'} ${SUIT_NAME[suitOfSet(set)]}`
}

/** "Minor" / "Major" / "8s & Jokers" — shown next to setGlyph. */
export function setKind(set: SetId): string {
  if (set === EXTRA_SET) return '8s & Jokers'
  return isMajorSet(set) ? 'Major' : 'Minor'
}

export function setKindShort(set: SetId): string {
  if (set === EXTRA_SET) return '8s·JK'
  return isMajorSet(set) ? 'Maj' : 'Min'
}

export function setGlyph(set: SetId): string {
  return set === EXTRA_SET ? '★' : SUIT_SYMBOL[suitOfSet(set)]
}

export function isRedSet(set: SetId): boolean {
  if (set === EXTRA_SET) return false
  const s = suitOfSet(set)
  return s === 'H' || s === 'D'
}

export function setShortLabel(set: SetId): string {
  return `${setKind(set)} ${setGlyph(set)}`
}

export function makeCard(rank: string, suit: Suit): CardId | null {
  const suitIx = SUITS.indexOf(suit)
  if (rank === '8') return EXTRA_SET * CARDS_PER_SET + suitIx
  const minorIx = (MINOR_RANKS as readonly string[]).indexOf(rank)
  if (minorIx >= 0) return suitIx * CARDS_PER_SET + minorIx
  const majorIx = (MAJOR_RANKS as readonly string[]).indexOf(rank)
  if (majorIx >= 0) return (4 + suitIx) * CARDS_PER_SET + majorIx
  return null
}

/** Parse shorthand like "6s", "10h", "th", "QD", "8c". Jokers: "jk*" (colourful) or "jk" (colourless). */
export function parseCard(input: string): CardId | null {
  const s = input.trim().toUpperCase().replace(/\s+/g, '')
  if (s === 'JK*' || s === 'JK★') return JOKER_COLOURFUL
  if (s === 'JK' || s === 'JK☆') return JOKER_COLOURLESS
  const m = /^(10|[2-9TJQKA])([SHDC♠♥♦♣])$/.exec(s)
  if (!m) return null
  const rank = m[1] === 'T' ? '10' : m[1]
  const suitChar = m[2]
  const suit = ({ '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' } as Record<string, Suit>)[suitChar] ?? (suitChar as Suit)
  return makeCard(rank, suit)
}

/** Display order for sets: grouped by suit, minor then major. */
export const SET_DISPLAY_ORDER: SetId[] = [0, 4, 1, 5, 2, 6, 3, 7]
