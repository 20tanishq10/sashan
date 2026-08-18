// SHASN — the Conspiracy and Headline decks along the bottom of the board.
//
// The printed board reserves four slots there, in this order:
//
//   CONSPIRACY  "PUT ANY COMBINATION OF RESOURCES"   ← buy the top card (p.18)
//   CONSPIRACY  "DISCARD PILE"
//   HEADLINE    "DISCARD PILE"
//   HEADLINE    "DRAW AT END OF TURN"                ← Volatile Areas (p.17)
//
// Only the top Conspiracy Card is ever purchasable, which is why the draw pile
// is the interactive slot and the discard is inert. The Headline deck is never
// clicked at all: it is drawn automatically when one of your voters lands in a
// Volatile Area, so it lights up only when a Headline is pending.

import CardStack from './CardStack'
import { CONSPIRACY_COST_MIN } from '../lib/shasn/constants'

export default function DeckStrip({
  conspiracyDeck,
  headlineDeck,
  pendingHeadlines = 0,
  canBuy = false,
  surcharge = 0,
  onBuyConspiracy = null,
  hand = 0,
}) {
  // Accepts either a live deck (hot-seat) or the redacted counts the server
  // sends online, where card identities are withheld but pile heights are not.
  const draw = (d) => d?.drawPile?.length ?? d?.drawCount ?? 0
  const disc = (d) => d?.discard?.length ?? d?.discardCount ?? 0

  const conDraw = draw(conspiracyDeck)
  const conDiscard = disc(conspiracyDeck)
  const headDraw = draw(headlineDeck)
  const headDiscard = disc(headlineDeck)

  return (
    <div style={S.strip}>
      <CardStack
        label="Conspiracy"
        caption="Put any combination of resources"
        count={conDraw}
        tone="conspiracy"
        cost={CONSPIRACY_COST_MIN + surcharge}
        onClick={onBuyConspiracy}
        disabled={!canBuy}
        highlight={canBuy && conDraw > 0}
      />

      <CardStack
        label="Conspiracy"
        caption="Discard pile"
        count={conDiscard}
        tone="conspiracy"
        empty={conDiscard === 0}
      />

      <div style={S.gap}>
        {hand > 0 && (
          <span style={S.handNote}>
            {hand} in hand
          </span>
        )}
      </div>

      <CardStack
        label="Headline"
        caption="Discard pile"
        count={headDiscard}
        tone="headline"
        empty={headDiscard === 0}
      />

      <CardStack
        label="Headline"
        caption="Draw at end of turn"
        count={headDraw}
        tone="headline"
        highlight={pendingHeadlines > 0}
      />

      {pendingHeadlines > 0 && (
        <span style={S.pending}>
          {pendingHeadlines} pending
        </span>
      )}
    </div>
  )
}

const S = {
  strip: {
    display: 'flex',
    gap: 14,
    justifyContent: 'center',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    background: 'var(--board-bg)',
    padding: '16px 16px 14px',
    borderRadius: '2px 2px 14px 14px',
    borderTop: '1px solid var(--border-2)',
  },
  gap: { minWidth: 20, display: 'flex', alignItems: 'center' },
  handNote: {
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'var(--ink-3)',
    writingMode: 'vertical-rl',
    textOrientation: 'mixed',
  },
  pending: {
    alignSelf: 'center',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    background: 'var(--danger)',
    color: 'var(--surface)',
    borderRadius: 10,
    padding: '3px 9px',
  },
}
